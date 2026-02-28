package com.safeways.backend.service;

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

    public void primesteSemnal(Vehicle v) { vehiculeInRaza.add(v); }

    public CompletableFuture<String> proceseazaTraficul() {
        if (vehiculeInRaza.size() < 2) {
            vehiculeInRaza.clear();
            return CompletableFuture.completedFuture("[\"Trafic sigur, sub 2 mașini.\"]");
        }

        List<CollisionPredictor.Predictie> predictii = new ArrayList<>();
        for (Vehicle v : vehiculeInRaza) {
            predictii.add(CollisionPredictor.calculeazaCinematica(v));
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

        StringBuilder contextBatch = new StringBuilder("ALARMĂ COLIZIUNE!\n\n");
        for (int i = 0; i < vehiculeInRaza.size(); i++) {
            Vehicle v = vehiculeInRaza.get(i);
            CollisionPredictor.Predictie p = predictii.get(i);

            contextBatch.append(String.format("- ID: %s (%s, %.0fkg) | Intenție: %s\n", v.getId(), v.getTipVehicul(), v.getGreutateKg(), v.getIntentie()));
            contextBatch.append(String.format("  Timp Sosire Normal: %.1fs | Dacă accelerează max: %.1fs\n", p.timpSosireNormal, p.timpSosireDacaAccelereaza));
            if (p.riscDerapaj) {
                contextBatch.append(String.format("  CRITIC: Intră cu %.0f km/h în viraj!\n", p.vitezaIntrareNodKmH));
            }
        }

        System.out.println("⚠️ AI DECLANȘAT:\n" + contextBatch);
        vehiculeInRaza.clear();
        return aiDecisionService.decideForIntersectionBatchAsync(nodeId, contextBatch.toString());
    }
}