package com.safeways.backend.model.vehicle;

import com.safeways.backend.model.Intention;

public class CivilVehicle extends Vehicle {

    // Legacy constructor
    public CivilVehicle(String id, double speedKmH, double weightKg, String targetNodeId, double distanceToNode) {
        super(id, speedKmH, weightKg, targetNodeId, distanceToNode);
    }

    // 2D constructor
    public CivilVehicle(String id, double speedKmH, double weightKg, double x, double y, double rotation) {
        super(id, speedKmH, weightKg, x, y, rotation);
    }

    @Override
    public String getTipVehicul() {
        return "Civil (Normal priority)";
    }
}