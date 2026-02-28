package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class IntersectionAntenna {

    @Autowired
    private AiDecisionService aiDecisionService;

    private List<Vehicle> vehiclesInRange = new ArrayList<>();
    private CopyOnWriteArrayList<VehicleLiveData> liveVehicleData = new CopyOnWriteArrayList<>();
    private String nodeId = "Main_Node";

    // Weather condition at antenna level (can simulate rain)
    private WeatherCondition currentWeather = WeatherCondition.RAIN;

    // Antenna coverage area - 50m radius (in coordinate units: 50m ≈ 0.00045 degrees)
    private static final double ANTENNA_RANGE = 0.00045;

    // Collision detection parameters
    private static final double COLLISION_RADIUS = 0.00045; // 50m in coordinate units
    private static final double TIME_HORIZON_SECONDS = 5.0;

    // Speed limit threshold (km/h) - hardcoded at 50
    private static final double SPEED_LIMIT = 50.0;

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
        return 50.0; // 50m range
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