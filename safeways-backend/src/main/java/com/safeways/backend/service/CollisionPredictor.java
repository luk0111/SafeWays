package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;

public class CollisionPredictor {

    public static class Predictie {
        public double timpSosireNormal;
        public double timpSosireDacaAccelereaza;
        public boolean nuPoateOpriFizic; // Dacă încearcă să frâneze, va derapa în intersecție?

        public Predictie(double timpNormal, double timpAccel, boolean nuPoateOpri) {
            this.timpSosireNormal = timpNormal;
            this.timpSosireDacaAccelereaza = timpAccel;
            this.nuPoateOpriFizic = nuPoateOpri;
        }
    }

    public static Predictie calculeazaCinematica(Vehicle v, WeatherCondition vreme) {
        double vInit = v.getVitezaKmH() / 3.6; // Transformăm în metri/secundă
        double d = v.getDistantaPanaLaNod();

        // 1. Calculăm factorul de aderență bazat pe vreme
        double factorAderenta = 1.0; // CLEAR
        if (vreme == WeatherCondition.RAIN) factorAderenta = 0.7;
        else if (vreme == WeatherCondition.SNOW) factorAderenta = 0.4;

        // 2. Aplicăm factorul la frânare și accelerare
        double aFranare = v.getCapabilitateFranareBaza() * factorAderenta;
        double aAccelerare = ((v.getGreutateKg() > 3500) ? 1.0 : 3.0) * factorAderenta;

        // 3. Timp de sosire la viteza constantă curentă
        double timpSosireNormal = d / vInit;

        // 4. Timp dacă accelerează (Evaziune)
        double delta = (vInit * vInit) - 4 * (0.5 * aAccelerare) * (-d);
        double timpDacaAccelereaza = (-vInit + Math.sqrt(delta)) / (2 * 0.5 * aAccelerare);
        if (Double.isNaN(timpDacaAccelereaza) || timpDacaAccelereaza < 0) timpDacaAccelereaza = 999;

        // 5. Calculăm distanța minimă de oprire: d = v^2 / (2 * a)
        // Dacă distanța sa până la nod este mai mică, înseamnă că fizic NU mai poate opri, chiar dacă apasă frâna la fund
        double distantaMinimaOprire = (vInit * vInit) / (2 * aFranare);
        boolean nuPoateOpri = (d < distantaMinimaOprire);

        return new Predictie(timpSosireNormal, timpDacaAccelereaza, nuPoateOpri);
    }
}