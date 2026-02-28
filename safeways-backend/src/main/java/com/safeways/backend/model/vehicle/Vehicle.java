package com.safeways.backend.model.vehicle;

import com.safeways.backend.model.Intention;

public abstract class Vehicle {
    protected String id;
    protected double vitezaKmH;
    protected double greutateKg;
    protected String targetNodeId;
    protected double distantaPanaLaNod; // în metri
    protected Intention intentie;

    public Vehicle(String id, double vitezaKmH, double greutateKg, String targetNodeId, double distantaPanaLaNod, Intention intentie) {
        this.id = id;
        this.vitezaKmH = vitezaKmH;
        this.greutateKg = greutateKg;
        this.targetNodeId = targetNodeId;
        this.distantaPanaLaNod = distantaPanaLaNod;
        this.intentie = intentie;
    }

    public abstract String getTipVehicul();

    // Frânare bazată pe fizică (m/s^2)
    public double getCapabilitateFranare() {
        if (greutateKg < 2000) return 7.5; // Auto mic
        if (greutateKg < 5000) return 5.0; // Dubă
        return 3.5; // Camion greu
    }

    public String getId() { return id; }
    public double getVitezaKmH() { return vitezaKmH; }
    public void setVitezaKmH(double v) { this.vitezaKmH = v; }
    public double getGreutateKg() { return greutateKg; }
    public double getDistantaPanaLaNod() { return distantaPanaLaNod; }
    public void setDistantaPanaLaNod(double d) { this.distantaPanaLaNod = d; }
    public Intention getIntentie() { return intentie; }
    public String getTargetNodeId() { return targetNodeId; }
}