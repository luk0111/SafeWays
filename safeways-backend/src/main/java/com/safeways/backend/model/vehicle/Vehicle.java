package com.safeways.backend.model.vehicle;

public abstract class Vehicle {
    protected String id;
    protected double vitezaKmH;
    protected double greutateKg;
    protected String targetNodeId;
    protected double distantaPanaLaNod; // în metri

    public Vehicle(String id, double vitezaKmH, double greutateKg, String targetNodeId, double distantaPanaLaNod) {
        this.id = id;
        this.vitezaKmH = vitezaKmH;
        this.greutateKg = greutateKg;
        this.targetNodeId = targetNodeId;
        this.distantaPanaLaNod = distantaPanaLaNod;
    }

    public abstract String getTipVehicul();
    // Adaugă astea sub celelalte variabile (ex: sub distantaPanaLaNod)
    protected String actiuneCurenta = "CONTINUA";
    protected double vitezaTintaKmH = -1.0;

    // Adaugă acești getteri/setteri la finalul clasei Vehicle:
    public String getActiuneCurenta() { return actiuneCurenta; }
    public void setActiuneCurenta(String actiune) { this.actiuneCurenta = actiune; }
    public double getVitezaTintaKmH() { return vitezaTintaKmH; }
    public void setVitezaTintaKmH(double vitezaTintaKmH) { this.vitezaTintaKmH = vitezaTintaKmH; }
    // Capacitate de frânare IDEALĂ (pe asfalt uscat)
    public double getCapabilitateFranareBaza() {
        if (greutateKg < 2000) return 7.5; // Auto mic
        if (greutateKg < 5000) return 5.0; // Dubă
        return 3.5; // Camion greu
    }

    // Getteri și Setteri
    public String getId() { return id; }
    public double getVitezaKmH() { return vitezaKmH; }
    public void setVitezaKmH(double v) { this.vitezaKmH = v; }
    public double getGreutateKg() { return greutateKg; }
    public double getDistantaPanaLaNod() { return distantaPanaLaNod; }
    public void setDistantaPanaLaNod(double d) { this.distantaPanaLaNod = d; }
    public String getTargetNodeId() { return targetNodeId; }
}