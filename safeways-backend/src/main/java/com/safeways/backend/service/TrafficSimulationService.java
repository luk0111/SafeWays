package com.safeways.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.safeways.backend.model.vehicle.CivilVehicle;
import com.safeways.backend.model.vehicle.Vehicle;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.ArrayList;
import java.util.List;

@Service
@EnableScheduling
public class TrafficSimulationService {

    @Autowired
    private IntersectionAntenna antena;

    private List<Vehicle> vehiculeActive = new ArrayList<>();
    private ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        // Punem 2 mașini de test care merg pe curs de coliziune spre "Nod_Test"
        vehiculeActive.add(new CivilVehicle("Auto_A", 60.0, 1500, "Nod_Test", 80.0));
        vehiculeActive.add(new CivilVehicle("Camion_B", 50.0, 5000, "Nod_Test", 80.0));
    }

    @Scheduled(fixedRate = 500) // Se execută automat la fiecare 0.5 secunde
    public void runSimulationTick() {
        if(vehiculeActive.isEmpty()) return;

        System.out.println("⏳ Tick Simulare... (0.5s)");

        // ==========================================
        // 1. APLICĂM FIZICA PENTRU FIECARE MAȘINĂ
        // ==========================================
        for (Vehicle v : vehiculeActive) {
            double vMs = v.getVitezaKmH() / 3.6; // Transformăm în m/s

            double aMaxFranare = v.getCapabilitateFranareBaza() * 0.7; // Presupunem vreme ploioasă (0.7)
            double aConfortabil = 2.0; // m/s^2
            double aAccelerare = (v.getGreutateKg() > 3500) ? 1.0 : 3.0; // m/s^2

            switch (v.getActiuneCurenta()) {
                case "OPRESTE":
                    vMs = Math.max(0, vMs - (aMaxFranare * 0.5));
                    break;
                case "INCETINESTE":
                    double targetMs = v.getVitezaTintaKmH() / 3.6;
                    if (vMs > targetMs) {
                        vMs = Math.max(targetMs, vMs - (aConfortabil * 0.5));
                    }
                    break;
                case "ACCELEREAZA":
                    vMs = vMs + (aAccelerare * 0.5);
                    break;
                case "CONTINUA":
                    break;
            }

            v.setVitezaKmH(vMs * 3.6);

            // Mutăm mașina
            double distantaParcursaMetri = vMs * 0.5;
            v.setDistantaPanaLaNod(Math.max(0, v.getDistantaPanaLaNod() - distantaParcursaMetri));

            System.out.printf("   🚗 %s: Viteza %.1f km/h | Distanta: %.1f m | Actiune: %s%n",
                    v.getId(), v.getVitezaKmH(), v.getDistantaPanaLaNod(), v.getActiuneCurenta());

            if (v.getDistantaPanaLaNod() > 0) {
                antena.primesteSemnal(v);
            }
        }

        // ==========================================
        // 2. ANTENA VERIFICĂ PERICOLUL ȘI CERE NOI COMENZI
        // ==========================================
        antena.proceseazaTraficul().thenAccept(decizie -> {
            if(!decizie.contains("AI offline") && !decizie.contains("Trafic sigur")) {

                try {
                    String jsonCurat = decizie.replace("```json", "").replace("```", "").trim();
                    System.out.println("\n🤖 RĂSPUNS BRUT AI:\n" + jsonCurat);

                    JsonNode rootNode = objectMapper.readTree(jsonCurat);

                    // Tratăm rebeliunile AI-ului (când dă obiect în loc de array)
                    if (rootNode.isObject()) {
                        if (rootNode.has("vehicleId") || rootNode.has("id") || rootNode.has("actiune") || rootNode.has("Actiune")) {
                            rootNode = objectMapper.createArrayNode().add(rootNode); // Forțăm într-o listă
                        }
                        else if (rootNode.elements().hasNext()) {
                            rootNode = rootNode.elements().next();
                        }
                    }

                    if (rootNode.isArray()) {
                        for (JsonNode node : rootNode) {

                            String id = "";
                            if (node.has("vehicleId")) id = node.get("vehicleId").asText();
                            else if (node.has("id")) id = node.get("id").asText();

                            String actiune = "CONTINUA";
                            if (node.has("actiune")) actiune = node.get("actiune").asText().toUpperCase();
                            else if (node.has("Actiune")) actiune = node.get("Actiune").asText().toUpperCase();

                            double vitezaTinta = node.has("vitezaTintaKmH") ? node.get("vitezaTintaKmH").asDouble() : 0.0;

                            if (!id.isEmpty()) {
                                for (Vehicle v : vehiculeActive) {
                                    if (v.getId().equals(id)) {
                                        v.setActiuneCurenta(actiune);
                                        v.setVitezaTintaKmH(vitezaTinta);
                                        System.out.println("✅ ACCEPTAT: " + id + " va executa comanda [" + actiune + "] la " + vitezaTinta + " km/h");
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception e) {
                    System.err.println("❌ EROARE PARSARE JSON AI! Textul primit a fost: \n" + decizie);
                }
            }
        });
    }
}