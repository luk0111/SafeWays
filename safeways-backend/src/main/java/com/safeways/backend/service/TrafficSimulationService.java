package com.safeways.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.safeways.backend.model.vehicle.CivilVehicle;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.ArrayList;
import java.util.List;

@Service
@EnableScheduling
public class TrafficSimulationService {

    @Autowired
    private IntersectionAntenna antenna;

    private List<Vehicle> activeVehicles = new ArrayList<>();
    private ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        // Add 2 test vehicles on collision course towards "Test_Node"
        activeVehicles.add(new CivilVehicle("Car_A", 60.0, 1500, "Test_Node", 80.0));
        activeVehicles.add(new CivilVehicle("Truck_B", 50.0, 5000, "Test_Node", 80.0));
    }

    @Scheduled(fixedRate = 500) // Runs automatically every 0.5 seconds
    public void runSimulationTick() {
        if(activeVehicles.isEmpty()) return;

        System.out.println("⏳ Simulation Tick... (0.5s)");

        // ==========================================
        // 1. APPLY PHYSICS FOR EACH VEHICLE
        // ==========================================
        for (Vehicle v : activeVehicles) {
            double speedMs = v.getSpeedKmH() / 3.6; // Convert to m/s

            double maxBrakingDecel = v.getCapabilitateFranareBaza() * 0.7; // Assume rainy weather (0.7)
            double comfortableDecel = 2.0; // m/s^2
            double acceleration = (v.getWeightKg() > 3500) ? 1.0 : 3.0; // m/s^2

            switch (v.getCurrentAction()) {
                case "STOP":
                    speedMs = Math.max(0, speedMs - (maxBrakingDecel * 0.5));
                    break;
                case "SLOW_DOWN":
                    double targetMs = v.getTargetSpeedKmH() / 3.6;
                    if (speedMs > targetMs) {
                        speedMs = Math.max(targetMs, speedMs - (comfortableDecel * 0.5));
                    }
                    break;
                case "ACCELERATE":
                    speedMs = speedMs + (acceleration * 0.5);
                    break;
                case "CONTINUE":
                    break;
            }

            v.setSpeedKmH(speedMs * 3.6);

            // Move the vehicle
            double distanceTraveledMeters = speedMs * 0.5;
            v.setDistanceToNode(Math.max(0, v.getDistanceToNode() - distanceTraveledMeters));

            System.out.printf("   🚗 %s: Speed %.1f km/h | Distance: %.1f m | Action: %s%n",
                    v.getId(), v.getSpeedKmH(), v.getDistanceToNode(), v.getCurrentAction());

            if (v.getDistanceToNode() > 0) {
                antenna.receiveSignal(v);
            }
        }

        // ==========================================
        // 2. ANTENNA CHECKS DANGER AND REQUESTS NEW COMMANDS
        // ==========================================
        antenna.processTraffic().thenAccept(decision -> {
            if(!decision.contains("AI offline") && !decision.contains("Traffic safe")) {

                try {
                    String cleanJson = decision.replace("```json", "").replace("```", "").trim();
                    System.out.println("\n🤖 RAW AI RESPONSE:\n" + cleanJson);

                    JsonNode rootNode = objectMapper.readTree(cleanJson);

                    // Handle AI response format variations (when it gives object instead of array)
                    if (rootNode.isObject()) {
                        if (rootNode.has("vehicleId") || rootNode.has("id") || rootNode.has("action") || rootNode.has("Action")) {
                            rootNode = objectMapper.createArrayNode().add(rootNode); // Force into a list
                        }
                        else if (rootNode.elements().hasNext()) {
                            rootNode = rootNode.elements().next();
                        }
                    }

                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {

                            String id = "";
                            if (node.has("vehicleId")) id = node.get("vehicleId").asText();
                            else if (node.has("id")) id = node.get("id").asText();

                            String action = "CONTINUE";
                            if (node.has("action")) action = node.get("action").asText().toUpperCase();
                            else if (node.has("Action")) action = node.get("Action").asText().toUpperCase();

                            double targetSpeed = node.has("targetSpeedKmH") ? node.get("targetSpeedKmH").asDouble() : 0.0;

                            if (!id.isEmpty()) {
                                for (Vehicle v : activeVehicles) {
                                    if (v.getId().equals(id)) {
                                        v.setCurrentAction(action);
                                        v.setTargetSpeedKmH(targetSpeed);
                                        System.out.println("✅ ACCEPTED: " + id + " will execute command [" + action + "] at " + targetSpeed + " km/h");
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    System.err.println("❌ JSON PARSING ERROR! Received text was: \n" + decision);
                }
            }
        });
    }
}