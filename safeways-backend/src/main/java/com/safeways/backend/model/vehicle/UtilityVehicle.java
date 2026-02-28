package com.safeways.backend.model.vehicle;

import com.safeways.backend.model.Intention;

public class UtilityVehicle extends Vehicle {
    private String utilityType;
    private boolean onMission;

    // Legacy constructor
    public UtilityVehicle(String id, double speedKmH, double weightKg, String targetNodeId, double distanceToNode, String utilityType, boolean onMission) {
        super(id, speedKmH, weightKg, targetNodeId, distanceToNode);
        this.utilityType = utilityType;
        this.onMission = onMission;
    }

    // 2D constructor
    public UtilityVehicle(String id, double speedKmH, double weightKg, double x, double y, double rotation, String utilityType, boolean onMission) {
        super(id, speedKmH, weightKg, x, y, rotation);
        this.utilityType = utilityType;
        this.onMission = onMission;
    }

    @Override
    public String getTipVehicul() {
        String status = onMission ? "MAXIMUM URGENCY (Sirens on)" : "Patrol (No priority)";
        return utilityType + " - " + status;
    }

    public String getUtilityType() { return utilityType; }
    public boolean isOnMission() { return onMission; }
}