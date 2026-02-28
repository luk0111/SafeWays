package com.safeways.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
// Asigură-te că imporți clasa ta! (Dacă IDE-ul sugerează alt pachet, alege-l pe al tău)
import com.safeways.backend.service.AiDecisionService;

@SpringBootTest
class SafewaysBackendApplicationTests {

	// 1. Cerem Spring-ului să ne "aducă" serviciul AI
	@Autowired
	private AiDecisionService aiDecisionService;

	@Test
	void contextLoads() {
		// Lasă acest test aici, el doar verifică dacă aplicația poate porni fără erori fatale
	}

	// 2. Creăm noul nostru test specific pentru JSON
	@Test
	void testAiJsonDecision() {
		System.out.println("🚗 --- START TEST AI V2X ---");

		// Date simulate de la o intersecție
		String vehicleId = "Masina_SMART_01";
		String situatieTrafic = "Afară plouă. Mașina rulează cu 50 km/h. Semaforul tocmai s-a făcut galben la 20 de metri distanță.";

		System.out.println("Trimitem situația către Qwen 2.5: " + situatieTrafic);

		// 3. Apelăm funcția din serviciul nostru
		long startTime = System.currentTimeMillis();
		String jsonResult = aiDecisionService.decideAction(vehicleId, situatieTrafic);
		long stopTime = System.currentTimeMillis();

		// 4. Afișăm rezultatul frumos în consolă
		System.out.println("\n✅ Răspuns generat în " + (stopTime - startTime) + " milisecunde!");
		System.out.println("📦 JSON Final:\n" + jsonResult);
		System.out.println("----------------------------\n");
	}
}