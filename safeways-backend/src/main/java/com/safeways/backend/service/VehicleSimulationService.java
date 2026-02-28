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
    private int nextVehicleId = 1;
    private int lastSpawnIndex = 0;
    private long lastUpdateTime = System.currentTimeMillis();
    private long lastSpawnTime = 0;

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
        Set<String> visited = new HashSet<>();
        Queue<List<String>> queue = new LinkedList<>();
        queue.add(Collections.singletonList(startNodeId));

        while (!queue.isEmpty()) {
            List<String> path = queue.poll();
            String current = path.get(path.size() - 1);

            if (rightNodes.contains(current)) {
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
                    if (neighborNode != null && currentNode != null
                            && neighborNode.getLongitude() >= currentNode.getLongitude() - 0.001) {
                        ((LinkedList<List<String>>) queue).addFirst(newPath);
                    } else {
                        queue.add(newPath);
                    }
                }
            }
        }

        return Collections.singletonList(startNodeId);
    }

    private String getNextSpawnPoint() {
        if (leftSpawnPoints.isEmpty()) return null;
        String nodeId = leftSpawnPoints.get(lastSpawnIndex % leftSpawnPoints.size());
        lastSpawnIndex++;
        return nodeId;
    }

    public synchronized Map<String, Object> spawnVehicle() {
        String startNodeId = getNextSpawnPoint();
        if (startNodeId == null) return Collections.emptyMap();

        List<String> path = findPathToRight(startNodeId);

        if (path.size() < 2) return Collections.emptyMap();

        MapNode startNode = nodesDict.get(path.get(0));
        MapNode nextNode = nodesDict.get(path.get(1));

        if (startNode == null || nextNode == null) return Collections.emptyMap();

        double targetRotation = calculateRotation(startNode.getLongitude(), startNode.getLatitude(),
                                                   nextNode.getLongitude(), nextNode.getLatitude());

        SimulatedVehicle vehicle = new SimulatedVehicle();
        vehicle.id = "Car-" + (nextVehicleId++);
        vehicle.x = startNode.getLongitude();
        vehicle.y = startNode.getLatitude();
        vehicle.targetX = nextNode.getLongitude();
        vehicle.targetY = nextNode.getLatitude();
        vehicle.path = path;
        vehicle.pathIndex = 0;
        vehicle.speed = 0.00000015 + Math.random() * 0.00000004;
        vehicle.rotation = targetRotation;
        vehicle.targetRotation = targetRotation;
        vehicle.active = true;

        vehicles.add(vehicle);

        Map<String, Object> result = new HashMap<>();
        result.put("id", vehicle.id);
        result.put("x", vehicle.x);
        result.put("y", vehicle.y);
        return result;
    }

    private double calculateRotation(double fromX, double fromY, double toX, double toY) {
        return Math.atan2(toY - fromY, toX - fromX);
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

    @Scheduled(fixedRate = 50)
    public void update() {
        long currentTime = System.currentTimeMillis();
        double deltaTime = currentTime - lastUpdateTime;
        lastUpdateTime = currentTime;

        double dt = Math.min(deltaTime, 50);

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
                    vehicle.x = currentNode.getLongitude();
                    vehicle.y = currentNode.getLatitude();
                    vehicle.targetX = nextNode.getLongitude();
                    vehicle.targetY = nextNode.getLatitude();
                    vehicle.targetRotation = calculateRotation(currentNode.getLongitude(), currentNode.getLatitude(),
                                                                nextNode.getLongitude(), nextNode.getLatitude());
                }
            } else {
                double moveX = (dx / dist) * vehicle.speed * dt;
                double moveY = (dy / dist) * vehicle.speed * dt;
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

    public List<Map<String, Object>> getVehicleStates() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (SimulatedVehicle v : vehicles) {
            Map<String, Object> state = new HashMap<>();
            state.put("id", v.id);
            state.put("x", v.x);
            state.put("y", v.y);
            state.put("rotation", v.rotation);
            state.put("speed", v.speed);
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
        double rotation;
        double targetRotation;
        boolean active;
    }
}

