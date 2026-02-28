package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
public class IntersectionAntenna {

    @Autowired
    private AiDecisionService aiDecisionService;

    private List<Vehicle> vehiclesInRange = new ArrayList<>();
    private String nodeId = "Main_Node";

    // Weather condition at antenna level (can simulate rain)
    private WeatherCondition currentWeather = WeatherCondition.RAIN;

    // Collision detection parameters
    private static final double COLLISION_RADIUS = 0.0003; // in coordinate units
    private static final double TIME_HORIZON_SECONDS = 5.0;

    public void receiveSignal(Vehicle v) {
        vehiclesInRange.add(v);
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
}