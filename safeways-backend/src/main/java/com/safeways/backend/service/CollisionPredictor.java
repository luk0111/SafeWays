package com.safeways.backend.service;

import com.safeways.backend.model.Intention;
import com.safeways.backend.model.vehicle.Vehicle;

public class CollisionPredictor {

    public static class Predictie {
        public double timpSosireNormal;
        public double timpSosireDacaAccelereaza;
        public boolean riscDerapaj;
        public double vitezaIntrareNodKmH;

        public Predictie(double timpNormal, double timpAccel, boolean risc, double vitezaIntrare) {
            this.timpSosireNormal = timpNormal;
            this.timpSosireDacaAccelereaza = timpAccel;
            this.riscDerapaj = risc;
            this.vitezaIntrareNodKmH = vitezaIntrare;
        }
    }

    public static Predictie calculeazaCinematica(Vehicle v) {
        double vInit = v.getVitezaKmH() / 3.6;
        double aFranare = v.getCapabilitateFranare();
        double aAccelerare = (v.getGreutateKg() > 3500) ? 1.0 : 3.0; // Grele vs Ușoare
        double d = v.getDistantaPanaLaNod();

        // Calcul Scenariu Accelerare Maximă: d = v*t + 0.5*a*t^2 => 0.5*a*t^2 + v*t - d = 0
        double delta = (vInit * vInit) - 4 * (0.5 * aAccelerare) * (-d);
        double timpDacaAccelereaza = (-vInit + Math.sqrt(delta)) / (2 * 0.5 * aAccelerare);
        if (Double.isNaN(timpDacaAccelereaza) || timpDacaAccelereaza < 0) timpDacaAccelereaza = 999;

        // Calcul Scenariu Normal / Frânare
        double vTarget = (v.getIntentie() == Intention.FATA) ? vInit : (15.0 / 3.6);

        if (vInit <= vTarget) {
            return new Predictie(d / vInit, timpDacaAccelereaza, false, vInit * 3.6);
        }

        double dNecesar = (vInit * vInit - vTarget * vTarget) / (2 * aFranare);
        if (d >= dNecesar) {
            double timpFranare = (vInit - vTarget) / aFranare;
            double timpRulareConstanta = (d - dNecesar) / vTarget;
            return new Predictie(timpFranare + timpRulareConstanta, timpDacaAccelereaza, false, vTarget * 3.6);
        } else {
            // Intră prea tare!
            double vIntrare = Math.sqrt(vInit * vInit - 2 * aFranare * d);
            double timpFranare = (vInit - vIntrare) / aFranare;
            return new Predictie(timpFranare, timpDacaAccelereaza, true, vIntrare * 3.6);
        }
    }
}