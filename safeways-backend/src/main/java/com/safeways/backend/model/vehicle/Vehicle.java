package com.safeways.backend.model.vehicle;

public abstract class Vehicle {
    protected String id;
    protected double speedKmH;
    protected double weightKg;
    protected String targetNodeId;
    protected double distanceToNode; // in meters

    // 2D position and direction
    protected double x;
    protected double y;
    protected double rotation; // in radians

    protected String currentAction = "CONTINUE";
    protected double targetSpeedKmH = -1.0;

    public Vehicle(String id, double speedKmH, double weightKg, String targetNodeId, double distanceToNode) {
        this.id = id;
        this.speedKmH = speedKmH;
        this.weightKg = weightKg;
        this.targetNodeId = targetNodeId;
        this.distanceToNode = distanceToNode;
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
    }

    public Vehicle(String id, double speedKmH, double weightKg, double x, double y, double rotation) {
        this.id = id;
        this.speedKmH = speedKmH;
        this.weightKg = weightKg;
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.targetNodeId = "";
        this.distanceToNode = 0;
    }

    public abstract String getTipVehicul();

    // Base braking capability (on dry asphalt)
    public double getCapabilitateFranareBaza() {
        if (weightKg < 2000) return 7.5; // Small car
        if (weightKg < 5000) return 5.0; // Van
        return 3.5; // Heavy truck
    }

    // Getters and Setters
    public String getId() { return id; }

    public double getVitezaKmH() { return speedKmH; }
    public double getSpeedKmH() { return speedKmH; }
    public void setVitezaKmH(double v) { this.speedKmH = v; }
    public void setSpeedKmH(double v) { this.speedKmH = v; }

    public double getGreutateKg() { return weightKg; }
    public double getWeightKg() { return weightKg; }

    public double getDistantaPanaLaNod() { return distanceToNode; }
    public double getDistanceToNode() { return distanceToNode; }
    public void setDistantaPanaLaNod(double d) { this.distanceToNode = d; }
    public void setDistanceToNode(double d) { this.distanceToNode = d; }

    public String getTargetNodeId() { return targetNodeId; }

    // 2D position and rotation
    public double getX() { return x; }
    public void setX(double x) { this.x = x; }
    public double getY() { return y; }
    public void setY(double y) { this.y = y; }
    public double getRotation() { return rotation; }
    public void setRotation(double rotation) { this.rotation = rotation; }

    // Action control
    public String getActiuneCurenta() { return currentAction; }
    public String getCurrentAction() { return currentAction; }
    public void setActiuneCurenta(String action) { this.currentAction = action; }
    public void setCurrentAction(String action) { this.currentAction = action; }

    public double getVitezaTintaKmH() { return targetSpeedKmH; }
    public double getTargetSpeedKmH() { return targetSpeedKmH; }
    public void setVitezaTintaKmH(double speed) { this.targetSpeedKmH = speed; }
    public void setTargetSpeedKmH(double speed) { this.targetSpeedKmH = speed; }
}