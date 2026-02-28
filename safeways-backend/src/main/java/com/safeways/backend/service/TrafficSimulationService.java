package com.safeways.backend.service;

import com.safeways.backend.model.Intention;
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

    @PostConstruct
    public void init() {
        // Punem 2 mașini de test care merg pe curs de coliziune directă
        vehiculeActive.add(new CivilVehicle("Auto_A", 50.0, 1500, "Nod_Test", 50.0, Intention.FATA));
        vehiculeActive.add(new CivilVehicle("Camion_B", 50.0, 5000, "Nod_Test", 50.0, Intention.STANGA));
    }

    @Scheduled(fixedRate = 500) // 0.5 secunde
    public void runSimulationTick() {
        if(vehiculeActive.isEmpty()) return;

        System.out.println("⏳ Tick Simulare...");

        for (Vehicle v : vehiculeActive) {
            // Actualizăm distanța (se apropie de nod) - o jumătate de secundă de rulare
            double distantaParcursaMetri = (v.getVitezaKmH() / 3.6) * 0.5;
            v.setDistantaPanaLaNod(v.getDistantaPanaLaNod() - distantaParcursaMetri);

            // Trimitem noile coordonate la antenă
            if (v.getDistantaPanaLaNod() > 0) {
                antena.primesteSemnal(v);
            }
        }

        // Antena calculează matematica și, dacă e grav, trimite la Qwen
        antena.proceseazaTraficul().thenAccept(decizie -> {
            if(!decizie.contains("AI offline") && !decizie.contains("Trafic sigur")) {
                System.out.println("🤖 DECIZIE AI PRIMITĂ:\n" + decizie);
                // Aici am opri fizic mașinile în mod normal
                vehiculeActive.clear(); // Oprim simularea după accident/evitare ca să nu facă spam în consolă
            }
        });
    }
}