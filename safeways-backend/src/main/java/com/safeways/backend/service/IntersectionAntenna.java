package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@Service
public class IntersectionAntenna {

    @Autowired
    private AiDecisionService aiDecisionService;

    private List<Vehicle> vehiculeInRaza = new ArrayList<>();
    private String nodeId = "Nod_Principal";

    // Setăm vremea la nivelul antenei (putem simula ploaia)
    private WeatherCondition vremeCurenta = WeatherCondition.RAIN;

    public void primesteSemnal(Vehicle v) { vehiculeInRaza.add(v); }

    public CompletableFuture<String> proceseazaTraficul() {
        if (vehiculeInRaza.size() < 2) {
            vehiculeInRaza.clear();
            return CompletableFuture.completedFuture("[\"Trafic sigur, sub 2 mașini.\"]");
        }

        List<CollisionPredictor.Predictie> predictii = new ArrayList<>();
        for (Vehicle v : vehiculeInRaza) {
            // Trimitem și starea vremii către predictorul fizic
            predictii.add(CollisionPredictor.calculeazaCinematica(v, vremeCurenta));
        }

        boolean pericolColiziune = false;
        for (int i = 0; i < vehiculeInRaza.size(); i++) {
            for (int j = i + 1; j < vehiculeInRaza.size(); j++) {
                double difTimp = Math.abs(predictii.get(i).timpSosireNormal - predictii.get(j).timpSosireNormal);
                if (difTimp <= 2.0) { pericolColiziune = true; break; }
            }
        }

        if (!pericolColiziune) {
            vehiculeInRaza.clear();
            return CompletableFuture.completedFuture("[\"Vehiculele au distanțare sigură (\u003E2s). AI offline.\"]");
        }

        // --- CONSTRUIM PROMPT-UL PENTRU AI ---
        StringBuilder contextBatch = new StringBuilder("ALARMĂ COLIZIUNE!\n");
        contextBatch.append("Condiții meteo în intersecție: ").append(vremeCurenta).append("\n\n");

        for (int i = 0; i < vehiculeInRaza.size(); i++) {
            Vehicle v = vehiculeInRaza.get(i);
            CollisionPredictor.Predictie p = predictii.get(i);

            contextBatch.append(String.format("- ID: %s (%s, %.0fkg)\n", v.getId(), v.getTipVehicul(), v.getGreutateKg()));
            contextBatch.append(String.format("  Viteza: %.0f km/h | Distanța: %.1fm\n", v.getVitezaKmH(), v.getDistantaPanaLaNod()));
            contextBatch.append(String.format("  Timp Sosire: %.1fs | Dacă accelerează max: %.1fs\n", p.timpSosireNormal, p.timpSosireDacaAccelereaza));

            if (p.nuPoateOpriFizic) {
                contextBatch.append("  CRITIC: Din cauza vremii și a vitezei, acest vehicul NU mai are spațiu fizic să oprească până la intersecție!\n");
            }
        }

        System.out.println("⚠️ AI DECLANȘAT:\n" + contextBatch);
        vehiculeInRaza.clear();
        return aiDecisionService.decideForIntersectionBatchAsync(nodeId, contextBatch.toString());
    }
}