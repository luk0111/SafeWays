const BACKEND_AI_PROXY = 'http://localhost:6767/api/ai';
const MODEL_NAME = 'qwen2.5:7b';

const logStyles = {
    ai: 'background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    thinking: 'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    decision: 'background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    analysis: 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    local: 'background: #6b7280; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    error: 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    info: 'background: #06b6d4; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
};

const logAI = (type, title, ...messages) => {
    const style = logStyles[type] || logStyles.info;
    console.log(`%c${title}`, style, ...messages);
};

export const analyzeTrafficDensity = (vehicles, trafficLights, mapData) => {
    if (!vehicles || !trafficLights || !mapData?.intersections) {
        return {};
    }

    const intersectionDensity = {};
    const detectionRadius = 0.0004;

    const intersectionIds = [...new Set(trafficLights.map(light => light.intersectionId))];

    intersectionIds.forEach(intersectionId => {
        const intersection = mapData.intersections.find(i => i.id === intersectionId);
        if (!intersection) return;

        const lightsAtIntersection = trafficLights.filter(l => l.intersectionId === intersectionId);

        const directionCounts = {};
        let totalVehicles = 0;

        lightsAtIntersection.forEach(light => {
            const vehiclesInDirection = vehicles.filter(vehicle => {
                if (vehicle.isAmbulance) return false;

                const dx = intersection.longitude - vehicle.x;
                const dy = intersection.latitude - vehicle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance > detectionRadius || distance < 0.00005) return false;

                const vehicleDir = vehicle.rotation;
                const toIntersectionDir = Math.atan2(dy, dx);
                const angleDiff = Math.abs(vehicleDir - toIntersectionDir);
                const normalizedDiff = angleDiff > Math.PI ? 2 * Math.PI - angleDiff : angleDiff;

                return normalizedDiff < Math.PI / 3;
            });

            directionCounts[light.id] = {
                count: vehiclesInDirection.length,
                phase: light.phase,
                state: light.state,
                rotation: light.rotation
            };
            totalVehicles += vehiclesInDirection.length;
        });

        const congestionScore = Math.min(100, totalVehicles * 15);

        let phase0Count = 0;
        let phase1Count = 0;

        Object.values(directionCounts).forEach(dir => {
            if (dir.phase === 0) phase0Count += dir.count;
            else phase1Count += dir.count;
        });

        intersectionDensity[intersectionId] = {
            totalVehicles,
            congestionScore,
            phase0Count,
            phase1Count,
            dominantPhase: phase0Count >= phase1Count ? 0 : 1,
            directionCounts,
            needsOptimization: Math.abs(phase0Count - phase1Count) >= 2 || totalVehicles >= 4
        };
    });

    const totalTraffic = Object.values(intersectionDensity).reduce((sum, d) => sum + d.totalVehicles, 0);
    if (totalTraffic > 0) {
        console.group('%c🚗 AI Traffic Analysis', logStyles.analysis);
        Object.entries(intersectionDensity).forEach(([id, data]) => {
            if (data.totalVehicles > 0) {
                console.log(
                    `📍 ${id}: ${data.totalVehicles} vehicles | ` +
                    `Congestion: ${data.congestionScore}% | ` +
                    `Phase 0: ${data.phase0Count} cars | Phase 1: ${data.phase1Count} cars | ` +
                    `${data.needsOptimization ? '⚠️ NEEDS OPTIMIZATION' : '✅ Balanced'}`
                );
            }
        });
        console.groupEnd();
    }

    return intersectionDensity;
};

const buildAIPrompt = (trafficAnalysis) => {
    const intersections = Object.entries(trafficAnalysis);

    if (intersections.length === 0) {
        return null;
    }

    let prompt = `You are a traffic light controller AI. Analyze the traffic data and decide which traffic lights to change.

TRAFFIC DATA:
`;

    intersections.forEach(([intersectionId, data]) => {
        const phase0Status = data.phase0Count > data.phase1Count ? 'CONGESTED' : 'LOW TRAFFIC';
        const phase1Status = data.phase1Count > data.phase0Count ? 'CONGESTED' : 'LOW TRAFFIC';

        prompt += `
Intersection ${intersectionId}:
- Phase 0 direction: ${data.phase0Count} vehicles waiting (${phase0Status})
- Phase 1 direction: ${data.phase1Count} vehicles waiting (${phase1Status})
- Congestion level: ${data.congestionScore}%
- Requires action: ${data.needsOptimization ? 'YES' : 'NO'}
`;
    });

    prompt += `
RULES:
1. Give GREEN to the congested direction (more vehicles waiting)
2. Give RED to the less congested direction
3. High congestion (>50%) needs immediate action
4. Respond ONLY with JSON

RESPOND WITH THIS EXACT JSON FORMAT:
{
  "decisions": [
    {
      "intersectionId": "id",
      "action": "PRIORITIZE_PHASE_0" | "PRIORITIZE_PHASE_1" | "KEEP_CURRENT",
      "greenDirection": "description of which direction gets GREEN",
      "redDirection": "description of which direction gets RED",
      "reason": "why this change helps traffic flow"
    }
  ],
  "thinking": "overall traffic analysis"
}`;

    return prompt;
};

const callOllamaAPI = async (prompt) => {
    try {
        logAI('ai', '🤖 AI REQUEST', 'Sending traffic data to Qwen 2.5 7b for analysis...');
        const startTime = Date.now();

        const response = await fetch(`${BACKEND_AI_PROXY}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.3,
                    num_predict: 500,
                }
            })
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
            logAI('error', '❌ AI ERROR', `HTTP ${response.status} - Backend proxy failed to reach Ollama`);
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.response;

        logAI('ai', '🤖 AI RESPONSE', `Received in ${elapsed}ms`);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            logAI('thinking', '🧠 AI THINKING', parsed.thinking || 'No reasoning provided');
            return parsed;
        }

        logAI('error', '⚠️ AI PARSE ERROR', 'Could not parse AI response as JSON:', responseText);
        return null;
    } catch (error) {
        logAI('error', '❌ AI CONNECTION FAILED', error.message);
        console.error('Full error:', error);
        return null;
    }
};

export const applyAIDecisions = (aiDecision, phaseOverrides) => {
    if (!aiDecision?.decisions) return phaseOverrides;

    const newOverrides = { ...phaseOverrides };

    console.group('%c🚦 AI TRAFFIC LIGHT CHANGES', logStyles.decision);

    aiDecision.decisions.forEach(decision => {
        if (decision.action === 'PRIORITIZE_PHASE_0') {
            newOverrides[decision.intersectionId] = {
                priorityPhase: 0,
                until: Date.now() + 10000,
                reason: decision.reason
            };
            console.log(
                `%c📍 Intersection ${decision.intersectionId}`,
                'font-weight: bold; font-size: 12px; color: #3b82f6;'
            );
            console.log(
                `%c   Change: 🔴 RED at the low-traffic direction (Phase 1)`,
                'color: #ef4444;'
            );
            console.log(
                `%c           🟢 GREEN at the congested direction (Phase 0)`,
                'color: #10b981;'
            );
            if (decision.greenDirection) {
                console.log(`   ➡️ GREEN: ${decision.greenDirection}`);
            }
            if (decision.redDirection) {
                console.log(`   ⬛ RED: ${decision.redDirection}`);
            }
            console.log(`   📝 Reason: ${decision.reason}`);
        } else if (decision.action === 'PRIORITIZE_PHASE_1') {
            newOverrides[decision.intersectionId] = {
                priorityPhase: 1,
                until: Date.now() + 10000,
                reason: decision.reason
            };
            console.log(
                `%c📍 Intersection ${decision.intersectionId}`,
                'font-weight: bold; font-size: 12px; color: #3b82f6;'
            );
            console.log(
                `%c   Change: 🔴 RED at the low-traffic direction (Phase 0)`,
                'color: #ef4444;'
            );
            console.log(
                `%c           🟢 GREEN at the congested direction (Phase 1)`,
                'color: #10b981;'
            );
            if (decision.greenDirection) {
                console.log(`   ➡️ GREEN: ${decision.greenDirection}`);
            }
            if (decision.redDirection) {
                console.log(`   ⬛ RED: ${decision.redDirection}`);
            }
            console.log(`   📝 Reason: ${decision.reason}`);
        } else if (decision.action === 'KEEP_CURRENT') {
            console.log(
                `%c📍 Intersection ${decision.intersectionId}`,
                'font-weight: bold; font-size: 12px; color: #6b7280;'
            );
            console.log(`   ⏸️ No change needed - traffic is balanced`);
            console.log(`   📝 Reason: ${decision.reason}`);
        }
    });

    console.groupEnd();

    return newOverrides;
};

export const runAITrafficControl = async (vehicles, trafficLights, mapData, currentOverrides = {}) => {
    const trafficAnalysis = analyzeTrafficDensity(vehicles, trafficLights, mapData);

    const needsOptimization = Object.values(trafficAnalysis).some(data => data.needsOptimization);

    if (!needsOptimization) {
        const now = Date.now();
        const cleanedOverrides = {};
        Object.entries(currentOverrides).forEach(([id, override]) => {
            if (override.until > now) {
                cleanedOverrides[id] = override;
            }
        });
        return { overrides: cleanedOverrides, analysis: trafficAnalysis, aiDecision: null };
    }

    logAI('info', '⚠️ OPTIMIZATION NEEDED', 'Traffic imbalance detected, consulting AI...');

    const prompt = buildAIPrompt(trafficAnalysis);
    if (!prompt) {
        return { overrides: currentOverrides, analysis: trafficAnalysis, aiDecision: null };
    }

    const aiDecision = await callOllamaAPI(prompt);

    if (aiDecision) {
        const newOverrides = applyAIDecisions(aiDecision, currentOverrides);
        return { overrides: newOverrides, analysis: trafficAnalysis, aiDecision };
    }

    return { overrides: currentOverrides, analysis: trafficAnalysis, aiDecision: null };
};

export const makeLocalDecision = (trafficAnalysis, currentOverrides = {}) => {
    const newOverrides = { ...currentOverrides };
    const now = Date.now();
    let decisionsCount = 0;

    Object.keys(newOverrides).forEach(id => {
        if (newOverrides[id].until <= now) {
            delete newOverrides[id];
        }
    });

    const decisions = [];

    Object.entries(trafficAnalysis).forEach(([intersectionId, data]) => {
        if (newOverrides[intersectionId]?.until > now) return;

        if (data.needsOptimization && Math.abs(data.phase0Count - data.phase1Count) >= 2) {
            const priorityPhase = data.dominantPhase;
            const vehiclesWaiting = priorityPhase === 0 ? data.phase0Count : data.phase1Count;

            newOverrides[intersectionId] = {
                priorityPhase,
                until: now + 8000,
                reason: `${vehiclesWaiting} vehicles waiting in Phase ${priorityPhase}`
            };

            decisions.push({
                intersectionId,
                priorityPhase,
                vehiclesWaiting,
                phase0Count: data.phase0Count,
                phase1Count: data.phase1Count
            });
            decisionsCount++;
        }
    });

    if (decisionsCount > 0) {
        console.group('%c🚦 LOCAL FALLBACK DECISIONS', logStyles.local);
        console.log('%c(AI unavailable - using heuristics)', 'color: #9ca3af; font-style: italic;');
        decisions.forEach(d => {
            const congestedPhase = d.priorityPhase;
            const lowTrafficPhase = d.priorityPhase === 0 ? 1 : 0;

            console.log(
                `%c📍 Intersection ${d.intersectionId}`,
                'font-weight: bold; font-size: 12px; color: #f59e0b;'
            );
            console.log(
                `%c   Change: 🔴 RED at the low-traffic direction (Phase ${lowTrafficPhase} - ${lowTrafficPhase === 0 ? d.phase0Count : d.phase1Count} cars)`,
                'color: #ef4444;'
            );
            console.log(
                `%c           🟢 GREEN at the congested direction (Phase ${congestedPhase} - ${d.vehiclesWaiting} cars)`,
                'color: #10b981;'
            );
            console.log(`   📝 Reason: ${d.vehiclesWaiting} vehicles waiting → prioritize congested direction`);
        });
        console.groupEnd();
    }

    return newOverrides;
};

export default {
    analyzeTrafficDensity,
    runAITrafficControl,
    applyAIDecisions,
    makeLocalDecision
};
