const API_BASE = 'http://localhost:6767/api/antenna';

export async function fetchAntennaLiveData() {
    try {
        const response = await fetch(`${API_BASE}/live`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching antenna live data:', error);
        return null;
    }
}

export async function fetchSpeedingVehicles() {
    try {
        const response = await fetch(`${API_BASE}/speeding`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching speeding vehicles:', error);
        return [];
    }
}

export async function fetchSpeedLimit() {
    try {
        const response = await fetch(`${API_BASE}/speed-limit`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.speedLimit;
    } catch (error) {
        console.error('Error fetching speed limit:', error);
        return 50;
    }
}

export async function predictCollisions() {
    try {
        const response = await fetch(`${API_BASE}/predict`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error predicting collisions:', error);
        return null;
    }
}

export async function updateVehicles(vehicles) {
    try {
        const response = await fetch(`${API_BASE}/update-vehicles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(vehicles),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error updating vehicles:', error);
        return null;
    }
}

export function parseAiDecision(aiDecisionJson) {
    if (!aiDecisionJson) return [];
    try {
        return JSON.parse(aiDecisionJson);
    } catch (error) {
        console.error('Error parsing AI decision:', error);
        return [];
    }
}

export async function antennaTick() {
    try {
        const response = await fetch(`${API_BASE}/tick`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error in antenna tick:', error);
        return null;
    }
}

export async function setAntennaPosition(x, y) {
    try {
        const response = await fetch(`${API_BASE}/set-position`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ x, y }),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error setting antenna position:', error);
        return null;
    }
}

export async function isSimulationPaused() {
    try {
        const response = await fetch(`${API_BASE}/is-paused`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error checking simulation pause state:', error);
        return { isPaused: false, lastAiDecision: null };
    }
}

export async function getVehiclesInRadius() {
    try {
        const response = await fetch(`${API_BASE}/vehicles-in-radius`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error getting vehicles in radius:', error);
        return [];
    }
}
