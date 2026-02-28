/**
 * OpenStreetMap Service - Fetches real map data from Brasov, Romania
 * Uses the Overpass API to get street network data
 */

// Brasov city center - small zone around Piata Sfatului (Council Square)
const BRASOV_BOUNDS = {
    south: 45.6380,
    north: 45.6450,
    west: 25.5850,
    east: 25.5950
};

/**
 * Fetches street data from OpenStreetMap for Brasov center
 */
export async function fetchBrasovMapData() {
    // Use curated fallback data for consistent, clean map display
    return getFallbackBrasovData();
}

/**
 * Parses raw OSM data into our map format
 */
function parseOSMData(osmData) {
    const nodes = {};
    const arcs = [];
    const intersections = [];
    const nodeConnections = {}; // Track how many ways connect to each node

    // First pass: collect all nodes
    osmData.elements.forEach(el => {
        if (el.type === 'node') {
            nodes[el.id] = {
                id: el.id.toString(),
                latitude: el.lat,
                longitude: el.lon
            };
            nodeConnections[el.id] = 0;
        }
    });

    // Second pass: create arcs from ways
    osmData.elements.forEach(el => {
        if (el.type === 'way' && el.nodes) {
            const wayNodes = el.nodes;

            // Count connections for intersection detection
            wayNodes.forEach(nodeId => {
                nodeConnections[nodeId] = (nodeConnections[nodeId] || 0) + 1;
            });

            // Create arc segments
            for (let i = 0; i < wayNodes.length - 1; i++) {
                const fromId = wayNodes[i];
                const toId = wayNodes[i + 1];

                if (nodes[fromId] && nodes[toId]) {
                    arcs.push({
                        from: fromId.toString(),
                        to: toId.toString(),
                        type: el.tags?.highway || 'road',
                        name: el.tags?.name || ''
                    });
                }
            }

            // Mark endpoints as potential intersections
            if (wayNodes.length > 0) {
                nodeConnections[wayNodes[0]]++;
                nodeConnections[wayNodes[wayNodes.length - 1]]++;
            }
        }
    });

    // Identify intersections (nodes with 3+ connections)
    Object.keys(nodeConnections).forEach(nodeId => {
        if (nodeConnections[nodeId] >= 3 && nodes[nodeId]) {
            intersections.push(nodes[nodeId]);
        }
    });

    // Build nodesDict
    const nodesDict = {};
    Object.values(nodes).forEach(node => {
        nodesDict[node.id] = node;
    });

    console.log(`Parsed OSM data: ${Object.keys(nodes).length} nodes, ${arcs.length} arcs, ${intersections.length} intersections`);

    return {
        nodes: Object.values(nodes),
        arcs,
        intersections,
        nodesDict,
        source: 'OpenStreetMap - Brasov, Romania'
    };
}

/**
 * Fallback data for Brasov center if API fails
 * Based on actual street layout around Piata Sfatului
 */
function getFallbackBrasovData() {
    // Simplified representation of Brasov's historic center
    const nodes = {
        // Piata Sfatului (Council Square) - central point
        'n1': { id: 'n1', latitude: 45.6410, longitude: 25.5890 },
        // Strada Republicii (main pedestrian street)
        'n2': { id: 'n2', latitude: 45.6420, longitude: 25.5885 },
        'n3': { id: 'n3', latitude: 45.6430, longitude: 25.5880 },
        'n4': { id: 'n4', latitude: 45.6400, longitude: 25.5895 },
        // Strada Michael Weiss
        'n5': { id: 'n5', latitude: 45.6415, longitude: 25.5910 },
        'n6': { id: 'n6', latitude: 45.6420, longitude: 25.5925 },
        // Strada Apollonia Hirscher
        'n7': { id: 'n7', latitude: 45.6405, longitude: 25.5875 },
        'n8': { id: 'n8', latitude: 45.6395, longitude: 25.5865 },
        // Strada Muresenilor
        'n9': { id: 'n9', latitude: 45.6408, longitude: 25.5905 },
        'n10': { id: 'n10', latitude: 45.6402, longitude: 25.5920 },
        // Additional streets
        'n11': { id: 'n11', latitude: 45.6425, longitude: 25.5900 },
        'n12': { id: 'n12', latitude: 45.6435, longitude: 25.5895 },
        'n13': { id: 'n13', latitude: 45.6390, longitude: 25.5880 },
        'n14': { id: 'n14', latitude: 45.6385, longitude: 25.5900 },
        'n15': { id: 'n15', latitude: 45.6412, longitude: 25.5870 },
        'n16': { id: 'n16', latitude: 45.6418, longitude: 25.5860 },
    };

    const arcs = [
        // Strada Republicii
        { from: 'n4', to: 'n1', type: 'pedestrian', name: 'Strada Republicii' },
        { from: 'n1', to: 'n2', type: 'pedestrian', name: 'Strada Republicii' },
        { from: 'n2', to: 'n3', type: 'pedestrian', name: 'Strada Republicii' },
        // Strada Michael Weiss
        { from: 'n1', to: 'n5', type: 'secondary', name: 'Strada Michael Weiss' },
        { from: 'n5', to: 'n6', type: 'secondary', name: 'Strada Michael Weiss' },
        // Strada Apollonia Hirscher
        { from: 'n1', to: 'n7', type: 'tertiary', name: 'Strada Apollonia Hirscher' },
        { from: 'n7', to: 'n8', type: 'tertiary', name: 'Strada Apollonia Hirscher' },
        // Strada Muresenilor
        { from: 'n1', to: 'n9', type: 'residential', name: 'Strada Mureșenilor' },
        { from: 'n9', to: 'n10', type: 'residential', name: 'Strada Mureșenilor' },
        // Cross streets
        { from: 'n2', to: 'n11', type: 'tertiary', name: '' },
        { from: 'n11', to: 'n5', type: 'tertiary', name: '' },
        { from: 'n11', to: 'n12', type: 'residential', name: '' },
        // Southern area
        { from: 'n4', to: 'n13', type: 'residential', name: '' },
        { from: 'n13', to: 'n8', type: 'residential', name: '' },
        { from: 'n4', to: 'n14', type: 'tertiary', name: '' },
        { from: 'n14', to: 'n10', type: 'tertiary', name: '' },
        // Western connections
        { from: 'n7', to: 'n15', type: 'residential', name: '' },
        { from: 'n15', to: 'n16', type: 'residential', name: '' },
        { from: 'n2', to: 'n15', type: 'tertiary', name: '' },
    ];

    // Dynamically calculate intersections based on node connections
    const nodeConnections = {};
    arcs.forEach(arc => {
        nodeConnections[arc.from] = (nodeConnections[arc.from] || 0) + 1;
        nodeConnections[arc.to] = (nodeConnections[arc.to] || 0) + 1;
    });

    // Nodes with 3+ connections are intersections
    const intersections = Object.keys(nodeConnections)
        .filter(nodeId => nodeConnections[nodeId] >= 3 && nodes[nodeId])
        .map(nodeId => ({
            id: nodes[nodeId].id,
            latitude: nodes[nodeId].latitude,
            longitude: nodes[nodeId].longitude
        }));

    // Find the most central intersection (most connections)
    let centralNodeId = 'n1';
    let maxConnections = 0;
    Object.keys(nodeConnections).forEach(nodeId => {
        if (nodeConnections[nodeId] > maxConnections && nodes[nodeId]) {
            maxConnections = nodeConnections[nodeId];
            centralNodeId = nodeId;
        }
    });

    const centralAntenna = {
        id: 'antenna_main',
        latitude: nodes[centralNodeId].latitude,
        longitude: nodes[centralNodeId].longitude,
        nodeId: centralNodeId
    };

    return {
        nodes: Object.values(nodes),
        arcs,
        intersections,
        nodesDict: nodes,
        centralAntenna,
        source: 'Fallback - Brasov Historic Center'
    };
}

/**
 * Calculates bounding box from map data
 */
export function calculateBoundingBox(mapData) {
    if (!mapData || !mapData.nodes || mapData.nodes.length === 0) {
        return BRASOV_BOUNDS;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    mapData.nodes.forEach(node => {
        minX = Math.min(minX, node.longitude);
        maxX = Math.max(maxX, node.longitude);
        minY = Math.min(minY, node.latitude);
        maxY = Math.max(maxY, node.latitude);
    });

    // Add padding
    const padX = (maxX - minX) * 0.1;
    const padY = (maxY - minY) * 0.1;

    return {
        minX: minX - padX,
        maxX: maxX + padX,
        minY: minY - padY,
        maxY: maxY + padY
    };
}

export { BRASOV_BOUNDS };

