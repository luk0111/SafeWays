package com.safeways.backend.model.vehicle;

import com.safeways.backend.model.Intention;

public class UtilityVehicle extends Vehicle {
    private String tipUtilitara;
    private boolean inMisiune;

    public UtilityVehicle(String id, double vitezaKmH, double greutateKg, String targetNodeId, double distantaPanaLaNod, Intention intentie, String tipUtilitara, boolean inMisiune) {
        super(id, vitezaKmH, greutateKg, targetNodeId, distantaPanaLaNod, intentie);
        this.tipUtilitara = tipUtilitara;
        this.inMisiune = inMisiune;
    }

    @Override
    public String getTipVehicul() {
        String status = inMisiune ? "URGENȚĂ MAXIMĂ (Girofar pornit)" : "Patrulare (Fără prioritate)";
        return tipUtilitara + " - " + status;
    }
}