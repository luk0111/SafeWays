package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Service
public class IntersectionAntenna {

    @Autowired
    private AiDecisionService aiDecisionService;

    private List<Vehicle> vehiclesInRange = new ArrayList<>();
    private CopyOnWriteArrayList<VehicleLiveData> liveVehicleData = new CopyOnWriteArrayList<>();
    private String nodeId = "Main_Node";

    // Weather condition at antenna level - CLEAR for normal sunny conditions
    private WeatherCondition currentWeather = WeatherCondition.CLEAR;

    // Antenna coverage area - ~50m radius
    private static final double ANTENNA_RANGE = 0.00045; // ~50m in coordinate units

    // Collision detection parameters
    private static final double COLLISION_RADIUS = 0.00045; // ~50m in coordinate units
    private static final double TIME_HORIZON_SECONDS = 2.0; // Predict collisions within 2 seconds

    // Antenna tick system
    private static final long TICK_INTERVAL_MS = 100; // 100ms tick interval
    private long lastTickTime = 0;
    private volatile boolean simulationPaused = false;
    private volatile String lastAiDecision = null;

    // Speed limit threshold (km/h) - hardcoded at 50
    private static final double SPEED_LIMIT = 50.0;

    // Antenna center position (can be configured)
    private double antennaX = 0.0;
    private double antennaY = 0.0;

    // Tick system state
    private AtomicBoolean isProcessingCollision = new AtomicBoolean(false);
    private volatile CollisionPredictionResult lastPredictionResult = null;

    public void receiveSignal(Vehicle v) {
        vehiclesInRange.add(v);

        // Update live vehicle data
        VehicleLiveData data = new VehicleLiveData(
            v.getId(),
            v.getTipVehicul(),
            v.getX(),
            v.getY(),
            v.getVitezaKmH(),
            v.getRotation(),
            v.getVitezaKmH() > SPEED_LIMIT
        );

        // Update or add vehicle data
        boolean found = false;
        for (int i = 0; i < liveVehicleData.size(); i++) {
            if (liveVehicleData.get(i).id.equals(v.getId())) {
                liveVehicleData.set(i, data);
                found = true;
                break;
            }
        }
        if (!found) {
            liveVehicleData.add(data);
        }
    }

    /**
     * Get all vehicles currently in antenna range with their live data
     */
    public List<VehicleLiveData> getLiveVehicleData() {
        return new ArrayList<>(liveVehicleData);
    }

    /**
     * Get only vehicles that are speeding (over the limit)
     */
    public List<VehicleLiveData> getSpeedingVehicles() {
        return liveVehicleData.stream()
            .filter(v -> v.isSpeeding)
            .collect(Collectors.toList());
    }

    /**
     * Get the current speed limit
     */
    public double getSpeedLimit() {
        return SPEED_LIMIT;
    }

    /**
     * Get the antenna range in meters
     */
    public double getAntennaRangeMeters() {
        return 50.0; // ~50m range
    }

    /**
     * Set the antenna center position
     */
    public void setAntennaPosition(double x, double y) {
        this.antennaX = x;
        this.antennaY = y;
    }

    /**
     * Get vehicles within the antenna's radius
     */
    public List<VehicleLiveData> getVehiclesInRadius() {
        return liveVehicleData.stream()
            .filter(v -> {
                double dx = v.x - antennaX;
                double dy = v.y - antennaY;
                double distance = Math.sqrt(dx * dx + dy * dy);
                return distance <= ANTENNA_RANGE;
            })
            .collect(Collectors.toList());
    }

    /**
     * Check if simulation is paused due to collision processing
     */
    public boolean isSimulationPaused() {
        return simulationPaused;
    }

    /**
     * Get the last AI decision (if any)
     */
    public String getLastAiDecision() {
        return lastAiDecision;
    }

    /**
     * Get the last prediction result
     */
    public CollisionPredictionResult getLastPredictionResult() {
        return lastPredictionResult;
    }

    /**
     * Antenna tick method - called periodically to process vehicles and detect collisions.
     * This is the main entry point for the antenna's collision detection system.
     *
     * When called, it:
     * 1. Gets all vehicles within the antenna's radius
     * 2. For each pair of vehicles, predicts if they will collide within 2 seconds
     * 3. If a collision is detected, pauses simulation and sends to AI
     * 4. Waits for AI decision and returns it
     *
     * @return CollisionPredictionResult with collision info and AI decision if applicable
     */
    public CollisionPredictionResult tick() {
        long currentTime = System.currentTimeMillis();

        // Rate limit ticks to prevent overwhelming the system
        if (currentTime - lastTickTime < TICK_INTERVAL_MS) {
            return lastPredictionResult;
        }
        lastTickTime = currentTime;

        // Get only vehicles within antenna radius
        List<VehicleLiveData> vehiclesInRadius = getVehiclesInRadius();

        System.out.println("📡 Antenna tick - " + vehiclesInRadius.size() + " vehicles in radius");

        if (vehiclesInRadius.size() < 2) {
            lastPredictionResult = new CollisionPredictionResult(
                false, null, null, vehiclesInRadius,
                new ArrayList<>(), "Less than 2 vehicles in range - no collision possible"
            );
            simulationPaused = false;
            return lastPredictionResult;
        }

        // Convert live data to 2D states for collision prediction
        List<CollisionPredictor.VehicleState2D> vehicleStates = new ArrayList<>();
        List<VehiclePrediction> predictions = new ArrayList<>();

        for (VehicleLiveData v : vehiclesInRadius) {
            // Create vehicle state from live data
            CollisionPredictor.VehicleState2D state = CollisionPredictor.VehicleState2D.fromVehicleWithDirection(
                v.x, v.y, v.rotation,
                v.speed, 1500.0, 8.0 // Default weight and braking for prediction
            );
            vehicleStates.add(state);

            // Calculate predicted positions at different time intervals
            List<double[]> predictedPositions = new ArrayList<>();
            for (double t = 0.5; t <= TIME_HORIZON_SECONDS; t += 0.5) {
                double predX = v.x + state.vx * t;
                double predY = v.y + state.vy * t;
                predictedPositions.add(new double[]{t, predX, predY});
            }

            predictions.add(new VehiclePrediction(
                v.id, v.x, v.y, v.speed, v.rotation,
                state.vx, state.vy, predictedPositions
            ));
        }

        // Detect potential collisions between ALL pairs of vehicles
        CollisionPredictor.CollisionResult dangerousCollision = null;
        String vehicle1Id = null;
        String vehicle2Id = null;

        for (int i = 0; i < vehicleStates.size(); i++) {
            for (int j = i + 1; j < vehicleStates.size(); j++) {
                CollisionPredictor.CollisionResult result = CollisionPredictor.detectCollision2D(
                    vehicleStates.get(i), vehicleStates.get(j),
                    COLLISION_RADIUS, TIME_HORIZON_SECONDS, currentWeather
                );
                if (result.collisionDetected) {
                    dangerousCollision = result;
                    vehicle1Id = vehiclesInRadius.get(i).id;
                    vehicle2Id = vehiclesInRadius.get(j).id;
                    System.out.println("🚨 Collision predicted between " + vehicle1Id + " and " + vehicle2Id +
                                     " in " + String.format("%.1f", result.timeToCollision) + " seconds!");
                    break;
                }
            }
            if (dangerousCollision != null) break;
        }

        // No collision detected
        if (dangerousCollision == null) {
            lastPredictionResult = new CollisionPredictionResult(
                false, null, null, vehiclesInRadius,
                predictions, "All vehicles have safe trajectories"
            );
            simulationPaused = false;
            return lastPredictionResult;
        }

        // COLLISION DETECTED - STOP EVERYTHING and send to AI
        System.out.println("🛑 STOPPING SIMULATION - Collision imminent!");
        simulationPaused = true;

        // Build context for AI
        StringBuilder contextBatch = new StringBuilder("🚨 URGENT COLLISION ALERT!\n");
        contextBatch.append("==================================\n");
        contextBatch.append("Weather conditions: ").append(currentWeather).append("\n");
        contextBatch.append(String.format("⏱️ TIME TO COLLISION: %.1f seconds\n", dangerousCollision.timeToCollision));
        contextBatch.append(String.format("📍 Collision point: [%.6f, %.6f]\n",
            dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1]));
        contextBatch.append(String.format("🚗 Vehicles involved: %s and %s\n\n", vehicle1Id, vehicle2Id));

        for (int i = 0; i < vehiclesInRadius.size(); i++) {
            VehicleLiveData v = vehiclesInRadius.get(i);
            CollisionPredictor.VehicleState2D state = vehicleStates.get(i);

            contextBatch.append(String.format("Vehicle %s:\n", v.id));
            contextBatch.append(String.format("  📍 Position: [%.6f, %.6f]\n", v.x, v.y));
            contextBatch.append(String.format("  🏎️ Velocity: [%.4f, %.4f] m/s | Speed: %.0f km/h\n", state.vx, state.vy, v.speed));
            contextBatch.append(String.format("  ⚠️ Speeding: %s\n", v.isSpeeding ? "YES" : "No"));

            if (dangerousCollision.collisionPoint != null) {
                CollisionPredictor.Prediction p = CollisionPredictor.calculateKinematics2D(
                    state, dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1], currentWeather
                );
                contextBatch.append(String.format("  ⏱️ Time to collision point: %.2fs | Distance: %.4f\n",
                    p.timeToArrivalNormal, p.distanceToCollision));
                if (p.cannotStopPhysically) {
                    contextBatch.append("  🔴 CRITICAL: CANNOT PHYSICALLY STOP before collision!\n");
                }
            }
            contextBatch.append("\n");
        }

        System.out.println("📡 Sending emergency context to AI:\n" + contextBatch);

        // BLOCKING CALL - Wait for AI response
        String aiDecision;
        try {
            CompletableFuture<String> aiFuture = aiDecisionService.decideForIntersectionBatchAsync(nodeId, contextBatch.toString());
            aiDecision = aiFuture.get(30, TimeUnit.SECONDS); // Block for up to 30 seconds
            System.out.println("✅ AI Response received: " + aiDecision);
        } catch (Exception e) {
            System.err.println("❌ AI Decision timeout or error: " + e.getMessage());
            // Emergency fallback - stop both vehicles
            aiDecision = "[{\"vehicleId\": \"" + vehicle1Id + "\", \"actiune\": \"OPRESTE\", \"vitezaTintaKmH\": 0, \"motiv\": \"Emergency stop - AI timeout\"}, " +
                         "{\"vehicleId\": \"" + vehicle2Id + "\", \"actiune\": \"OPRESTE\", \"vitezaTintaKmH\": 0, \"motiv\": \"Emergency stop - AI timeout\"}]";
        }

        lastAiDecision = aiDecision;

        // Resume simulation after AI decision is received
        simulationPaused = false;
        System.out.println("▶️ RESUMING SIMULATION - AI decision applied");

        lastPredictionResult = new CollisionPredictionResult(
            true,
            new CollisionInfo(
                dangerousCollision.timeToCollision,
                dangerousCollision.collisionPoint,
                vehicle1Id,
                vehicle2Id
            ),
            aiDecision,
            vehiclesInRadius,
            predictions,
            "Collision predicted - AI decision provided"
        );

        return lastPredictionResult;
    }

    /**
     * Get count of vehicles in range
     */
    public int getVehicleCount() {
        return liveVehicleData.size();
    }

    /**
     * Get count of speeding vehicles
     */
    public int getSpeedingVehicleCount() {
        return (int) liveVehicleData.stream()
            .filter(v -> v.isSpeeding)
            .count();
    }

    /**
     * Update or add vehicle data from external source (e.g., frontend simulation)
     */
    public void updateVehicleData(VehicleLiveData data) {
        // Update or add vehicle data
        boolean found = false;
        for (int i = 0; i < liveVehicleData.size(); i++) {
            if (liveVehicleData.get(i).id.equals(data.id)) {
                liveVehicleData.set(i, data);
                found = true;
                break;
            }
        }
        if (!found) {
            liveVehicleData.add(data);
        }
    }

    /**
     * Remove vehicles that are no longer active
     */
    public void removeVehicle(String vehicleId) {
        liveVehicleData.removeIf(v -> v.id.equals(vehicleId));
    }

    /**
     * Predict vehicle positions and detect potential collisions.
     * If a collision is predicted, this method BLOCKS until AI provides a decision.
     *
     * @return CollisionPredictionResult containing predictions and AI decision if collision detected
     */
    public CollisionPredictionResult predictAndAnalyze() {
        List<VehicleLiveData> currentVehicles = new ArrayList<>(liveVehicleData);

        if (currentVehicles.size() < 2) {
            return new CollisionPredictionResult(
                false, null, null, currentVehicles,
                new ArrayList<>(), "Less than 2 vehicles in range - no collision possible"
            );
        }

        // Convert live data to 2D states for collision prediction
        List<CollisionPredictor.VehicleState2D> vehicleStates = new ArrayList<>();
        List<VehiclePrediction> predictions = new ArrayList<>();

        for (VehicleLiveData v : currentVehicles) {
            // Create vehicle state from live data
            CollisionPredictor.VehicleState2D state = CollisionPredictor.VehicleState2D.fromVehicleWithDirection(
                v.x, v.y, v.rotation,
                v.speed, 1500.0, 8.0 // Default weight and braking for prediction
            );
            vehicleStates.add(state);

            // Calculate predicted positions at different time intervals
            List<double[]> predictedPositions = new ArrayList<>();
            for (double t = 0.5; t <= TIME_HORIZON_SECONDS; t += 0.5) {
                double predX = v.x + state.vx * t;
                double predY = v.y + state.vy * t;
                predictedPositions.add(new double[]{t, predX, predY});
            }

            predictions.add(new VehiclePrediction(
                v.id, v.x, v.y, v.speed, v.rotation,
                state.vx, state.vy, predictedPositions
            ));
        }

        // Detect potential collisions
        CollisionPredictor.CollisionResult dangerousCollision = null;
        String vehicle1Id = null;
        String vehicle2Id = null;

        for (int i = 0; i < vehicleStates.size(); i++) {
            for (int j = i + 1; j < vehicleStates.size(); j++) {
                CollisionPredictor.CollisionResult result = CollisionPredictor.detectCollision2D(
                    vehicleStates.get(i), vehicleStates.get(j),
                    COLLISION_RADIUS, TIME_HORIZON_SECONDS, currentWeather
                );
                if (result.collisionDetected) {
                    dangerousCollision = result;
                    vehicle1Id = currentVehicles.get(i).id;
                    vehicle2Id = currentVehicles.get(j).id;
                    break;
                }
            }
            if (dangerousCollision != null) break;
        }

        // No collision detected
        if (dangerousCollision == null) {
            return new CollisionPredictionResult(
                false, null, null, currentVehicles,
                predictions, "All vehicles have safe trajectories"
            );
        }

        // COLLISION DETECTED - Build context and BLOCK for AI decision
        System.out.println("🚨 COLLISION PREDICTED! Blocking for AI decision...");

        StringBuilder contextBatch = new StringBuilder("COLLISION PREDICTION ALERT!\n");
        contextBatch.append("Weather conditions: ").append(currentWeather).append("\n");
        contextBatch.append(String.format("Predicted collision in: %.1f seconds\n", dangerousCollision.timeToCollision));
        contextBatch.append(String.format("Collision point: [%.6f, %.6f]\n",
            dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1]));
        contextBatch.append(String.format("Vehicles involved: %s and %s\n\n", vehicle1Id, vehicle2Id));

        for (int i = 0; i < currentVehicles.size(); i++) {
            VehicleLiveData v = currentVehicles.get(i);
            CollisionPredictor.VehicleState2D state = vehicleStates.get(i);

            contextBatch.append(String.format("- ID: %s\n", v.id));
            contextBatch.append(String.format("  Position: [%.6f, %.6f]\n", v.x, v.y));
            contextBatch.append(String.format("  Velocity: [%.4f, %.4f] m/s | Speed: %.0f km/h\n", state.vx, state.vy, v.speed));
            contextBatch.append(String.format("  Speeding: %s\n", v.isSpeeding ? "YES ⚠️" : "No"));

            if (dangerousCollision.collisionPoint != null) {
                CollisionPredictor.Prediction p = CollisionPredictor.calculateKinematics2D(
                    state, dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1], currentWeather
                );
                contextBatch.append(String.format("  Time to collision point: %.1fs | Distance: %.4f\n",
                    p.timeToArrivalNormal, p.distanceToCollision));
                if (p.cannotStopPhysically) {
                    contextBatch.append("  ⚠️ CRITICAL: Cannot physically stop before collision!\n");
                }
            }
            contextBatch.append("\n");
        }

        System.out.println("📡 Sending to AI:\n" + contextBatch);

        // BLOCKING CALL - Wait for AI response
        String aiDecision;
        try {
            CompletableFuture<String> aiFuture = aiDecisionService.decideForIntersectionBatchAsync(nodeId, contextBatch.toString());
            aiDecision = aiFuture.get(30, TimeUnit.SECONDS); // Block for up to 30 seconds
            System.out.println("✅ AI Response received: " + aiDecision);
        } catch (Exception e) {
            System.err.println("❌ AI Decision timeout or error: " + e.getMessage());
            aiDecision = "[{\"vehicleId\": \"" + vehicle1Id + "\", \"actiune\": \"OPRESTE\", \"vitezaTintaKmH\": 0, \"motiv\": \"Emergency stop - AI timeout\"}, " +
                         "{\"vehicleId\": \"" + vehicle2Id + "\", \"actiune\": \"OPRESTE\", \"vitezaTintaKmH\": 0, \"motiv\": \"Emergency stop - AI timeout\"}]";
        }

        return new CollisionPredictionResult(
            true,
            new CollisionInfo(
                dangerousCollision.timeToCollision,
                dangerousCollision.collisionPoint,
                vehicle1Id,
                vehicle2Id
            ),
            aiDecision,
            currentVehicles,
            predictions,
            "Collision predicted - AI decision provided"
        );
    }

    /**
     * DTO for collision prediction result
     */
    public static class CollisionPredictionResult {
        public final boolean collisionPredicted;
        public final CollisionInfo collisionInfo;
        public final String aiDecision;
        public final List<VehicleLiveData> vehicles;
        public final List<VehiclePrediction> predictions;
        public final String status;

        public CollisionPredictionResult(boolean collisionPredicted, CollisionInfo collisionInfo,
                                          String aiDecision, List<VehicleLiveData> vehicles,
                                          List<VehiclePrediction> predictions, String status) {
            this.collisionPredicted = collisionPredicted;
            this.collisionInfo = collisionInfo;
            this.aiDecision = aiDecision;
            this.vehicles = vehicles;
            this.predictions = predictions;
            this.status = status;
        }

        // Getters for JSON
        public boolean isCollisionPredicted() { return collisionPredicted; }
        public CollisionInfo getCollisionInfo() { return collisionInfo; }
        public String getAiDecision() { return aiDecision; }
        public List<VehicleLiveData> getVehicles() { return vehicles; }
        public List<VehiclePrediction> getPredictions() { return predictions; }
        public String getStatus() { return status; }
    }

    /**
     * DTO for collision information
     */
    public static class CollisionInfo {
        public final double timeToCollision;
        public final double[] collisionPoint;
        public final String vehicle1Id;
        public final String vehicle2Id;

        public CollisionInfo(double timeToCollision, double[] collisionPoint,
                            String vehicle1Id, String vehicle2Id) {
            this.timeToCollision = timeToCollision;
            this.collisionPoint = collisionPoint;
            this.vehicle1Id = vehicle1Id;
            this.vehicle2Id = vehicle2Id;
        }

        public double getTimeToCollision() { return timeToCollision; }
        public double[] getCollisionPoint() { return collisionPoint; }
        public String getVehicle1Id() { return vehicle1Id; }
        public String getVehicle2Id() { return vehicle2Id; }
    }

    /**
     * DTO for vehicle position prediction
     */
    public static class VehiclePrediction {
        public final String id;
        public final double currentX;
        public final double currentY;
        public final double speed;
        public final double rotation;
        public final double velocityX;
        public final double velocityY;
        public final List<double[]> predictedPositions; // [time, x, y]

        public VehiclePrediction(String id, double currentX, double currentY, double speed,
                                 double rotation, double velocityX, double velocityY,
                                 List<double[]> predictedPositions) {
            this.id = id;
            this.currentX = currentX;
            this.currentY = currentY;
            this.speed = speed;
            this.rotation = rotation;
            this.velocityX = velocityX;
            this.velocityY = velocityY;
            this.predictedPositions = predictedPositions;
        }

        public String getId() { return id; }
        public double getCurrentX() { return currentX; }
        public double getCurrentY() { return currentY; }
        public double getSpeed() { return speed; }
        public double getRotation() { return rotation; }
        public double getVelocityX() { return velocityX; }
        public double getVelocityY() { return velocityY; }
        public List<double[]> getPredictedPositions() { return predictedPositions; }
    }

    /**
     * Clear stale vehicle data (call periodically if needed)
     */
    public void clearLiveData() {
        liveVehicleData.clear();
    }

    public CompletableFuture<String> processTraffic() {
        if (vehiclesInRange.size() < 2) {
            vehiclesInRange.clear();
            return CompletableFuture.completedFuture("[\"Traffic safe, less than 2 vehicles.\"]");
        }

        // Convert vehicles to 2D states for collision detection
        List<CollisionPredictor.VehicleState2D> vehicleStates = new ArrayList<>();
        for (Vehicle v : vehiclesInRange) {
            CollisionPredictor.VehicleState2D state = CollisionPredictor.VehicleState2D.fromVehicleWithDirection(
                v.getX(), v.getY(), v.getRotation(),
                v.getVitezaKmH(), v.getGreutateKg(), v.getCapabilitateFranareBaza()
            );
            vehicleStates.add(state);
        }

        // Check for 2D collisions between all vehicle pairs
        boolean collisionDanger = false;
        CollisionPredictor.CollisionResult dangerousCollision = null;

        for (int i = 0; i < vehicleStates.size(); i++) {
            for (int j = i + 1; j < vehicleStates.size(); j++) {
                CollisionPredictor.CollisionResult result = CollisionPredictor.detectCollision2D(
                    vehicleStates.get(i), vehicleStates.get(j),
                    COLLISION_RADIUS, TIME_HORIZON_SECONDS, currentWeather
                );
                if (result.collisionDetected) {
                    collisionDanger = true;
                    dangerousCollision = result;
                    break;
                }
            }
            if (collisionDanger) break;
        }

        if (!collisionDanger) {
            vehiclesInRange.clear();
            return CompletableFuture.completedFuture("[\"Vehicles have safe spacing. AI offline.\"]");
        }

        // --- BUILD PROMPT FOR AI ---
        StringBuilder contextBatch = new StringBuilder("COLLISION ALARM!\n");
        contextBatch.append("Weather conditions at intersection: ").append(currentWeather).append("\n");

        if (dangerousCollision != null) {
            contextBatch.append(String.format("Estimated time to collision: %.1f seconds\n", dangerousCollision.timeToCollision));
            if (dangerousCollision.collisionPoint != null) {
                contextBatch.append(String.format("Collision point: [%.6f, %.6f]\n",
                    dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1]));
            }
        }
        contextBatch.append("\n");

        for (int i = 0; i < vehiclesInRange.size(); i++) {
            Vehicle v = vehiclesInRange.get(i);
            CollisionPredictor.VehicleState2D state = vehicleStates.get(i);

            contextBatch.append(String.format("- ID: %s (%s, %.0fkg)\n", v.getId(), v.getTipVehicul(), v.getGreutateKg()));
            contextBatch.append(String.format("  Position: [%.6f, %.6f]\n", state.x, state.y));
            contextBatch.append(String.format("  Velocity: [%.4f, %.4f] m/s | Speed: %.0f km/h\n", state.vx, state.vy, v.getVitezaKmH()));

            // Calculate individual predictions if collision point exists
            if (dangerousCollision != null && dangerousCollision.collisionPoint != null) {
                CollisionPredictor.Prediction p = CollisionPredictor.calculateKinematics2D(
                    state, dangerousCollision.collisionPoint[0], dangerousCollision.collisionPoint[1], currentWeather
                );
                contextBatch.append(String.format("  Time to collision point: %.1fs | Distance: %.4f\n",
                    p.timeToArrivalNormal, p.distanceToCollision));

                if (p.cannotStopPhysically) {
                    contextBatch.append("  CRITICAL: Due to weather and speed, this vehicle CANNOT physically stop before collision point!\n");
                }
            }
        }

        System.out.println("⚠️ AI TRIGGERED:\n" + contextBatch);
        vehiclesInRange.clear();
        return aiDecisionService.decideForIntersectionBatchAsync(nodeId, contextBatch.toString());
    }

    // Legacy method name for backward compatibility
    @Deprecated
    public void primesteSemnal(Vehicle v) {
        receiveSignal(v);
    }

    @Deprecated
    public CompletableFuture<String> proceseazaTraficul() {
        return processTraffic();
    }

    /**
     * DTO for live vehicle data transmitted by the antenna
     */
    public static class VehicleLiveData {
        public final String id;
        public final String type;
        public final double x;
        public final double y;
        public final double speed;
        public final double rotation;
        public final boolean isSpeeding;

        public VehicleLiveData(String id, String type, double x, double y, double speed, double rotation, boolean isSpeeding) {
            this.id = id;
            this.type = type;
            this.x = x;
            this.y = y;
            this.speed = speed;
            this.rotation = rotation;
            this.isSpeeding = isSpeeding;
        }

        // Getters for JSON serialization
        public String getId() { return id; }
        public String getType() { return type; }
        public double getX() { return x; }
        public double getY() { return y; }
        public double getSpeed() { return speed; }
        public double getRotation() { return rotation; }
        public boolean getIsSpeeding() { return isSpeeding; }
    }
}