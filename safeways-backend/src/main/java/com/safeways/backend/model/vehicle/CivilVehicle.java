package com.safeways.backend.model.vehicle;

import com.safeways.backend.model.Intention;

public class CivilVehicle extends Vehicle {
    public CivilVehicle(String id, double vitezaKmH, double greutateKg, String targetNodeId, double distantaPanaLaNod, Intention intentie) {
        super(id, vitezaKmH, greutateKg, targetNodeId, distantaPanaLaNod, intentie);
    }

    @Override
    public String getTipVehicul() {
        return "Civil (Prioritate normală)";
    }
}