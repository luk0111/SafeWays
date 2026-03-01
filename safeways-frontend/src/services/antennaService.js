const API_BASE = 'http://localhost:6767/api/antenna';

/**
 * Fetch live data from all vehicles in antenna range
 * Includes speeding information (vehicles over 50 km/h)
 */
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


/**
 * Fetch only vehicles that are speeding (over 50 km/h)
 */
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

/**
 * Fetch current speed limit
 */
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
        return 50; // Default fallback
    }
}

/**
 * Predict vehicle positions and check for potential collisions.
 * WARNING: This call may BLOCK for several seconds if a collision is predicted,
 * as it waits for AI to provide a decision.
 *
 * @returns {Promise<Object>} Prediction result including:
 *   - collisionPredicted: boolean
 *   - collisionInfo: { timeToCollision, collisionPoint, vehicle1Id, vehicle2Id }
 *   - aiDecision: JSON string with AI recommendations
 *   - vehicles: current vehicle data
 *   - predictions: predicted future positions for each vehicle
 *   - status: human-readable status message
 */
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

/**
 * Update vehicle positions in the backend antenna
 * Call this periodically to keep the backend in sync with frontend simulation
 *
 * @param {Array<Object>} vehicles - Array of vehicle objects with:
 *   - id: string
 *   - x: number (longitude)
 *   - y: number (latitude)
 *   - speed: number (km/h)
 *   - rotation: number (radians)
 */
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

/**
 * Parse AI decision JSON string into usable array
 * @param {string} aiDecisionJson - JSON string from AI
 * @returns {Array<Object>} Parsed decisions or empty array
 */
export function parseAiDecision(aiDecisionJson) {
    if (!aiDecisionJson) return [];
    try {
        return JSON.parse(aiDecisionJson);
    } catch (error) {
        console.error('Error parsing AI decision:', error);
        return [];
    }
}

/**
 * Antenna tick - the main entry point for collision detection.
 * This should be called periodically (every 100-500ms recommended).
 *
 * The antenna will:
 * 1. Get all vehicles within its radius
 * 2. Check for potential collisions between all pairs within 2 seconds
 * 3. If collision detected, BLOCK and wait for AI decision
 * 4. Return the result with AI decision if applicable
 *
 * WARNING: This call may BLOCK for up to 30 seconds if a collision is detected!
 *
 * @returns {Promise<Object>} Tick result including:
 *   - collisionPredicted: boolean
 *   - collisionInfo: { timeToCollision, collisionPoint, vehicle1Id, vehicle2Id }
 *   - aiDecision: JSON string with AI recommendations
 *   - vehicles: current vehicles in radius
 *   - predictions: predicted future positions
 *   - status: human-readable status message
 */
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

/**
 * Set the antenna center position
 * All vehicles within antenna range of this position will be monitored
 *
 * @param {number} x - Longitude of antenna center
 * @param {number} y - Latitude of antenna center
 */
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

/**
 * Check if simulation is currently paused (waiting for AI decision)
 *
 * @returns {Promise<Object>} { isPaused: boolean, lastAiDecision: string }
 */
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

/**
 * Get vehicles currently within the antenna's radius
 *
 * @returns {Promise<Array>} Array of vehicles in antenna radius
 */
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
