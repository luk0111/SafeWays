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

