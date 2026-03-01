package com.safeways.backend.controller;

import com.safeways.backend.service.IntersectionAntenna;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/antenna")
@CrossOrigin(origins = "*")
public class AntennaController {

    @Autowired
    private IntersectionAntenna intersectionAntenna;

    /**
     * Get live data from all vehicles in antenna range
     * Includes speeding information (vehicles over 50 km/h)
     */
    @GetMapping("/live")
    public Map<String, Object> getLiveData() {
        Map<String, Object> response = new HashMap<>();
        response.put("vehicles", intersectionAntenna.getLiveVehicleData());
        response.put("speedingVehicles", intersectionAntenna.getSpeedingVehicles());
        response.put("totalCount", intersectionAntenna.getVehicleCount());
        response.put("speedingCount", intersectionAntenna.getSpeedingVehicleCount());
        response.put("speedLimit", intersectionAntenna.getSpeedLimit());
        response.put("antennaRangeMeters", intersectionAntenna.getAntennaRangeMeters());
        return response;
    }

    /**
     * Get only vehicles that are speeding (over 50 km/h)
     */
    @GetMapping("/speeding")
    public List<IntersectionAntenna.VehicleLiveData> getSpeedingVehicles() {
        return intersectionAntenna.getSpeedingVehicles();
    }

    /**
     * Get current speed limit
     */
    @GetMapping("/speed-limit")
    public Map<String, Object> getSpeedLimit() {
        Map<String, Object> response = new HashMap<>();
        response.put("speedLimit", intersectionAntenna.getSpeedLimit());
        return response;
    }

    /**
     * Predict vehicle positions and detect potential collisions.
     * WARNING: This endpoint BLOCKS if a collision is predicted, waiting for AI decision.
     *
     * Returns:
     * - Vehicle predictions (future positions based on current trajectory)
     * - Collision detection result
     * - AI decision (if collision predicted)
     */
    @GetMapping("/predict")
    public IntersectionAntenna.CollisionPredictionResult predictCollisions() {
        return intersectionAntenna.predictAndAnalyze();
    }

    /**
     * Antenna tick endpoint - the main entry point for collision detection.
     *
     * This endpoint should be called periodically (every 100ms recommended).
     * It will:
     * 1. Get all vehicles within the antenna's radius
     * 2. Check for potential collisions between all pairs within 2 seconds
     * 3. If collision detected, BLOCK and wait for AI decision
     * 4. Return the result with AI decision if applicable
     *
     * WARNING: This call may BLOCK for up to 30 seconds if a collision is detected!
     */
    @GetMapping("/tick")
    public IntersectionAntenna.CollisionPredictionResult tick() {
        return intersectionAntenna.tick();
    }

    /**
     * Set the antenna center position
     * All vehicles within ANTENNA_RANGE of this position will be monitored
     */
    @PostMapping("/set-position")
    public Map<String, Object> setAntennaPosition(@RequestBody Map<String, Double> position) {
        Map<String, Object> response = new HashMap<>();

        Double x = position.get("x");
        Double y = position.get("y");

        if (x == null || y == null) {
            response.put("status", "error");
            response.put("message", "Missing x or y coordinates");
            return response;
        }

        intersectionAntenna.setAntennaPosition(x, y);
        response.put("status", "success");
        response.put("x", x);
        response.put("y", y);
        return response;
    }

    /**
     * Check if simulation is currently paused (waiting for AI decision)
     */
    @GetMapping("/is-paused")
    public Map<String, Object> isSimulationPaused() {
        Map<String, Object> response = new HashMap<>();
        response.put("isPaused", intersectionAntenna.isSimulationPaused());
        response.put("lastAiDecision", intersectionAntenna.getLastAiDecision());
        return response;
    }

    /**
     * Get vehicles currently within the antenna's radius
     */
    @GetMapping("/vehicles-in-radius")
    public List<IntersectionAntenna.VehicleLiveData> getVehiclesInRadius() {
        return intersectionAntenna.getVehiclesInRadius();
    }

    /**
     * Update vehicle data from frontend simulation
     * Allows frontend to send vehicle positions to backend for collision prediction
     */
    @PostMapping("/update-vehicles")
    public Map<String, Object> updateVehicles(@RequestBody List<VehicleUpdateDTO> vehicles) {
        Map<String, Object> response = new HashMap<>();

        for (VehicleUpdateDTO v : vehicles) {
            IntersectionAntenna.VehicleLiveData data = new IntersectionAntenna.VehicleLiveData(
                v.id,
                "Car",
                v.x,
                v.y,
                v.speed,
                v.rotation,
                v.speed > 50
            );
            intersectionAntenna.updateVehicleData(data);
        }

        response.put("updated", vehicles.size());
        response.put("status", "success");
        return response;
    }

    /**
     * DTO for vehicle updates from frontend
     */
    public static class VehicleUpdateDTO {
        public String id;
        public double x;
        public double y;
        public double speed;
        public double rotation;

        // Getters and setters for JSON deserialization
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public double getX() { return x; }
        public void setX(double x) { this.x = x; }
        public double getY() { return y; }
        public void setY(double y) { this.y = y; }
        public double getSpeed() { return speed; }
        public void setSpeed(double speed) { this.speed = speed; }
        public double getRotation() { return rotation; }
        public void setRotation(double rotation) { this.rotation = rotation; }
    }
}

