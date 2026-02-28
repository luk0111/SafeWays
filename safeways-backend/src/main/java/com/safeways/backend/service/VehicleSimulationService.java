package com.safeways.backend.service;

import com.safeways.backend.model.xml.CityMap;
import com.safeways.backend.model.xml.MapArc;
import com.safeways.backend.model.xml.MapNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class VehicleSimulationService {

    @Autowired
    private MapService mapService;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private Map<String, List<String>> adjacencyList = new HashMap<>();
    private Map<String, MapNode> nodesDict = new HashMap<>();
    private List<SimulatedVehicle> vehicles = new CopyOnWriteArrayList<>();
    private List<String> leftSpawnPoints = new ArrayList<>();
    private List<String> rightSpawnPoints = new ArrayList<>();
    private int nextVehicleId = 1;
    private int lastLeftSpawnIndex = 0;
    private int lastRightSpawnIndex = 0;
    private int spawnDirection = 0;
    private long lastUpdateTime = System.currentTimeMillis();
    private long lastSpawnTime = 0;
    private long lastSpeedingTime = 0;
    private long nextSpeedingInterval = getRandomSpeedingInterval();

    // Speed limit in km/h
    private static final double SPEED_LIMIT = 50.0;
    private static final Random random = new Random();

    @PostConstruct
    public void init() {
        buildGraph();
        for (int i = 0; i < 3; i++) {
            spawnVehicle();
        }
    }

    private void buildGraph() {
        CityMap map = mapService.getMap();
        if (map == null || map.getNodes() == null) return;

        for (MapNode node : map.getNodes()) {
            nodesDict.put(node.getId(), node);
            adjacencyList.put(node.getId(), new ArrayList<>());
        }

        if (map.getArcs() != null) {
            for (MapArc arc : map.getArcs()) {
                adjacencyList.computeIfAbsent(arc.getFrom(), k -> new ArrayList<>()).add(arc.getTo());
                adjacencyList.computeIfAbsent(arc.getTo(), k -> new ArrayList<>()).add(arc.getFrom());
            }
        }

        leftSpawnPoints = getLeftmostNodes();
        leftSpawnPoints.sort((a, b) -> Double.compare(
            nodesDict.get(a).getLatitude(),
            nodesDict.get(b).getLatitude()
        ));

        rightSpawnPoints = getRightmostNodes();
        rightSpawnPoints.sort((a, b) -> Double.compare(
            nodesDict.get(a).getLatitude(),
            nodesDict.get(b).getLatitude()
        ));
    }

    private List<String> getLeftmostNodes() {
        if (nodesDict.isEmpty()) return Collections.emptyList();

        double minLon = nodesDict.values().stream().mapToDouble(MapNode::getLongitude).min().orElse(0);
        double maxLon = nodesDict.values().stream().mapToDouble(MapNode::getLongitude).max().orElse(0);
        double threshold = minLon + (maxLon - minLon) * 0.25;

        List<String> result = new ArrayList<>();
        for (MapNode node : nodesDict.values()) {
            if (node.getLongitude() <= threshold) {
                result.add(node.getId());
            }
        }
        return result;
    }

    private List<String> getRightmostNodes() {
        if (nodesDict.isEmpty()) return Collections.emptyList();

        double minLon = nodesDict.values().stream().mapToDouble(MapNode::getLongitude).min().orElse(0);
        double maxLon = nodesDict.values().stream().mapToDouble(MapNode::getLongitude).max().orElse(0);
        double threshold = maxLon - (maxLon - minLon) * 0.25;

        List<String> result = new ArrayList<>();
        for (MapNode node : nodesDict.values()) {
            if (node.getLongitude() >= threshold) {
                result.add(node.getId());
            }
        }
        return result;
    }

    private List<String> findPathToRight(String startNodeId) {
        Set<String> rightNodes = new HashSet<>(getRightmostNodes());
        return findPath(startNodeId, rightNodes, true);
    }

    private List<String> findPathToLeft(String startNodeId) {
        Set<String> leftNodes = new HashSet<>(getLeftmostNodes());
        return findPath(startNodeId, leftNodes, false);
    }

    private List<String> findPath(String startNodeId, Set<String> targetNodes, boolean preferRight) {
        Set<String> visited = new HashSet<>();
        Queue<List<String>> queue = new LinkedList<>();
        queue.add(Collections.singletonList(startNodeId));

        while (!queue.isEmpty()) {
            List<String> path = queue.poll();
            String current = path.get(path.size() - 1);

            if (targetNodes.contains(current) && path.size() > 1) {
                return path;
            }

            if (visited.contains(current)) continue;
            visited.add(current);

            List<String> neighbors = adjacencyList.getOrDefault(current, Collections.emptyList());
            List<String> shuffled = new ArrayList<>(neighbors);
            Collections.shuffle(shuffled);

            for (String neighbor : shuffled) {
                if (!visited.contains(neighbor)) {
                    List<String> newPath = new ArrayList<>(path);
                    newPath.add(neighbor);

                    MapNode neighborNode = nodesDict.get(neighbor);
                    MapNode currentNode = nodesDict.get(current);
                    if (neighborNode != null && currentNode != null) {
                        boolean isPreferredDirection = preferRight
                            ? neighborNode.getLongitude() >= currentNode.getLongitude() - 0.001
                            : neighborNode.getLongitude() <= currentNode.getLongitude() + 0.001;

                        if (isPreferredDirection) {
                            ((LinkedList<List<String>>) queue).addFirst(newPath);
                        } else {
                            queue.add(newPath);
                        }
                    }
                }
            }
        }

        return Collections.singletonList(startNodeId);
    }

    private String getNextLeftSpawnPoint() {
        if (leftSpawnPoints.isEmpty()) return null;
        String nodeId = leftSpawnPoints.get(lastLeftSpawnIndex % leftSpawnPoints.size());
        lastLeftSpawnIndex++;
        return nodeId;
    }

    private String getNextRightSpawnPoint() {
        if (rightSpawnPoints.isEmpty()) return null;
        String nodeId = rightSpawnPoints.get(lastRightSpawnIndex % rightSpawnPoints.size());
        lastRightSpawnIndex++;
        return nodeId;
    }

    public synchronized Map<String, Object> spawnVehicle() {
        boolean goingRight = spawnDirection % 2 == 0;
        spawnDirection++;

        String startNodeId;
        List<String> path;

        if (goingRight) {
            startNodeId = getNextLeftSpawnPoint();
            if (startNodeId == null) return Collections.emptyMap();
            path = findPathToRight(startNodeId);
        } else {
            startNodeId = getNextRightSpawnPoint();
            if (startNodeId == null) return Collections.emptyMap();
            path = findPathToLeft(startNodeId);
        }

        if (path.size() < 2) return Collections.emptyMap();

        MapNode startNode = nodesDict.get(path.get(0));
        MapNode nextNode = nodesDict.get(path.get(1));

        if (startNode == null || nextNode == null) return Collections.emptyMap();

        double targetRotation = calculateRotation(startNode.getLongitude(), startNode.getLatitude(),
                                                   nextNode.getLongitude(), nextNode.getLatitude());

        double[] offset = getLaneOffset(startNode.getLongitude(), startNode.getLatitude(),
                                        nextNode.getLongitude(), nextNode.getLatitude(), goingRight);

        SimulatedVehicle vehicle = new SimulatedVehicle();
        vehicle.id = "Car-" + (nextVehicleId++);
        vehicle.x = startNode.getLongitude() + offset[0];
        vehicle.y = startNode.getLatitude() + offset[1];
        vehicle.targetX = nextNode.getLongitude() + offset[0];
        vehicle.targetY = nextNode.getLatitude() + offset[1];
        vehicle.path = path;
        vehicle.pathIndex = 0;
        vehicle.speed = 0.00000015 + Math.random() * 0.00000008;
        vehicle.speedKmH = 30 + Math.random() * 20; // Normal speed: 30-50 km/h
        vehicle.rotation = targetRotation;
        vehicle.targetRotation = targetRotation;
        vehicle.active = true;
        vehicle.direction = goingRight ? "right" : "left";

        vehicles.add(vehicle);

        Map<String, Object> result = new HashMap<>();
        result.put("id", vehicle.id);
        result.put("x", vehicle.x);
        result.put("y", vehicle.y);
        result.put("direction", vehicle.direction);
        return result;
    }

    private double calculateRotation(double fromX, double fromY, double toX, double toY) {
        return Math.atan2(toY - fromY, toX - fromX);
    }

    private double[] getLaneOffset(double fromX, double fromY, double toX, double toY, boolean goingRight) {
        double dx = toX - fromX;
        double dy = toY - fromY;
        double len = Math.sqrt(dx * dx + dy * dy);
        if (len == 0) return new double[]{0, 0};

        double perpX = dy / len;
        double perpY = -dx / len;

        double laneWidth = 0.000024;

        return new double[]{perpX * laneWidth, perpY * laneWidth};
    }

    private double normalizeAngle(double angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    private double lerpAngle(double from, double to, double t) {
        double diff = normalizeAngle(to - from);
        return from + diff * t;
    }

    /**
     * Calculate distance between two points
     */
    private double getDistance(double x1, double y1, double x2, double y2) {
        double dx = x2 - x1;
        double dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Find the closest car in front of the given vehicle within the search distance (same direction only)
     */
    private SimulatedVehicle findCarInFront(SimulatedVehicle vehicle, double searchDistance) {
        SimulatedVehicle closest = null;
        double closestDist = Double.MAX_VALUE;

        // Calculate vehicle's direction vector
        double dirX = Math.cos(vehicle.rotation);
        double dirY = Math.sin(vehicle.rotation);

        for (SimulatedVehicle other : vehicles) {
            if (other == vehicle || !other.active) continue;

            // Only consider cars going in the same direction (same lane)
            if (!other.direction.equals(vehicle.direction)) continue;

            // Vector from this vehicle to the other
            double toOtherX = other.x - vehicle.x;
            double toOtherY = other.y - vehicle.y;
            double dist = Math.sqrt(toOtherX * toOtherX + toOtherY * toOtherY);

            // Skip if too far
            if (dist > searchDistance) continue;

            // Check if the other car is in front (dot product > 0 means same direction)
            double dotProduct = dirX * toOtherX + dirY * toOtherY;

            // Only consider cars that are in front (positive dot product)
            // and roughly in the same lane (within a certain angle)
            if (dotProduct > 0) {
                // Check angle - car should be roughly ahead, not to the side
                double angle = Math.abs(Math.atan2(toOtherY, toOtherX) - vehicle.rotation);
                angle = normalizeAngle(angle);

                // Within ~30 degrees of the direction we're heading
                if (Math.abs(angle) < Math.PI / 6) {
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = other;
                    }
                }
            }
        }

        return closest;
    }

    @Scheduled(fixedRate = 50)
    public void update() {
        long currentTime = System.currentTimeMillis();
        double deltaTime = currentTime - lastUpdateTime;
        lastUpdateTime = currentTime;

        double dt = Math.min(deltaTime, 50);

        // Check if it's time to generate a random speeding vehicle (every 5-10 seconds)
        if (currentTime - lastSpeedingTime >= nextSpeedingInterval) {
            generateRandomSpeeder();
            lastSpeedingTime = currentTime;
            nextSpeedingInterval = getRandomSpeedingInterval();
        }

        // Minimum distance between cars (in coordinate units, ~10m)
        final double MIN_CAR_DISTANCE = 0.00012;
        // Safe following distance (in coordinate units, ~15m)
        final double SAFE_FOLLOWING_DISTANCE = 0.00018;

        Iterator<SimulatedVehicle> iterator = vehicles.iterator();
        while (iterator.hasNext()) {
            SimulatedVehicle vehicle = iterator.next();
            if (!vehicle.active) {
                iterator.remove();
                continue;
            }

            vehicle.rotation = lerpAngle(vehicle.rotation, vehicle.targetRotation, 0.12);

            double dx = vehicle.targetX - vehicle.x;
            double dy = vehicle.targetY - vehicle.y;
            double dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.00003) {
                vehicle.pathIndex++;

                if (vehicle.pathIndex >= vehicle.path.size() - 1) {
                    vehicle.active = false;
                    continue;
                }

                String currentNodeId = vehicle.path.get(vehicle.pathIndex);
                String nextNodeId = vehicle.path.get(vehicle.pathIndex + 1);
                MapNode currentNode = nodesDict.get(currentNodeId);
                MapNode nextNode = nodesDict.get(nextNodeId);

                if (currentNode != null && nextNode != null) {
                    boolean goingRight = "right".equals(vehicle.direction);
                    double[] offset = getLaneOffset(currentNode.getLongitude(), currentNode.getLatitude(),
                                                    nextNode.getLongitude(), nextNode.getLatitude(), goingRight);

                    vehicle.x = currentNode.getLongitude() + offset[0];
                    vehicle.y = currentNode.getLatitude() + offset[1];
                    vehicle.targetX = nextNode.getLongitude() + offset[0];
                    vehicle.targetY = nextNode.getLatitude() + offset[1];
                    vehicle.targetRotation = calculateRotation(currentNode.getLongitude(), currentNode.getLatitude(),
                                                                nextNode.getLongitude(), nextNode.getLatitude());
                }
            } else {
                // Check for car in front and adjust speed
                SimulatedVehicle carInFront = findCarInFront(vehicle, SAFE_FOLLOWING_DISTANCE);

                double effectiveSpeedKmH = vehicle.speedKmH;

                if (carInFront != null) {
                    double distToCarInFront = getDistance(vehicle.x, vehicle.y, carInFront.x, carInFront.y);

                    // If too close, stop completely
                    if (distToCarInFront <= MIN_CAR_DISTANCE) {
                        effectiveSpeedKmH = 0;
                    }
                    // If within safe distance, match the car in front's speed or slow down
                    else if (distToCarInFront < SAFE_FOLLOWING_DISTANCE) {
                        // Gradually reduce speed as we get closer
                        double slowdownFactor = (distToCarInFront - MIN_CAR_DISTANCE) / (SAFE_FOLLOWING_DISTANCE - MIN_CAR_DISTANCE);
                        double targetSpeed = Math.min(vehicle.speedKmH, carInFront.speedKmH);
                        effectiveSpeedKmH = carInFront.speedKmH * slowdownFactor + targetSpeed * (1 - slowdownFactor);
                        effectiveSpeedKmH = Math.min(effectiveSpeedKmH, carInFront.speedKmH);
                    }
                }

                // Speed multiplier based on effectiveSpeedKmH (base speed is calibrated for ~40 km/h)
                double speedMultiplier = effectiveSpeedKmH / 40.0;
                double actualSpeed = vehicle.speed * speedMultiplier;

                double moveX = (dx / dist) * actualSpeed * dt;
                double moveY = (dy / dist) * actualSpeed * dt;
                vehicle.x += moveX;
                vehicle.y += moveY;
            }
        }

        if (vehicles.size() < 12 && (currentTime - lastSpawnTime) >= 2500) {
            spawnVehicle();
            lastSpawnTime = currentTime;
        }

        messagingTemplate.convertAndSend("/topic/vehicles", getVehicleStates());
    }

    /**
     * Get random interval between 5-10 seconds (in milliseconds)
     */
    private long getRandomSpeedingInterval() {
        return 5000 + random.nextInt(5000);
    }

    /**
     * Randomly make a vehicle speed over the limit
     */
    private void generateRandomSpeeder() {
        List<SimulatedVehicle> eligibleVehicles = new ArrayList<>();
        for (SimulatedVehicle v : vehicles) {
            if (v.active && v.speedKmH <= SPEED_LIMIT) {
                eligibleVehicles.add(v);
            }
        }

        if (eligibleVehicles.isEmpty()) return;

        // Pick a random vehicle to make it speed
        SimulatedVehicle vehicle = eligibleVehicles.get(random.nextInt(eligibleVehicles.size()));

        // Set speed to 51-80 km/h (over the 50 km/h limit)
        vehicle.speedKmH = 51 + random.nextDouble() * 29;
        System.out.println("⚠️ Vehicle " + vehicle.id + " is now speeding at " + Math.round(vehicle.speedKmH) + " km/h!");
    }

    public List<Map<String, Object>> getVehicleStates() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (SimulatedVehicle v : vehicles) {
            Map<String, Object> state = new HashMap<>();
            state.put("id", v.id);
            state.put("x", v.x);
            state.put("y", v.y);
            state.put("rotation", v.rotation);
            state.put("speed", v.speedKmH); // Return speedKmH for display
            state.put("speedKmH", v.speedKmH);
            state.put("isSpeeding", v.speedKmH > SPEED_LIMIT);
            state.put("isCurrentUser", false);
            result.add(state);
        }
        return result;
    }

    public Map<String, Object> getGraphInfo() {
        Map<String, Object> info = new HashMap<>();
        info.put("nodeCount", nodesDict.size());
        info.put("vehicleCount", vehicles.size());
        info.put("leftNodes", getLeftmostNodes());
        info.put("rightNodes", getRightmostNodes());
        return info;
    }

    private static class SimulatedVehicle {
        String id;
        double x;
        double y;
        double targetX;
        double targetY;
        List<String> path;
        int pathIndex;
        double speed;
        double speedKmH; // Speed in km/h for display and speeding detection
        double rotation;
        double targetRotation;
        boolean active;
        String direction;
    }
}

