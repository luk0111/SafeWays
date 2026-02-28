package com.safeways.backend.service;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

@Service
public class AiDecisionService {

    private ChatLanguageModel qwenModel;

    @Value("${ollama.host:localhost}")
    private String ollamaHost;

    @PostConstruct
    public void init() {
        System.out.println("🤖 Inițializare conexiune AI către: http://" + ollamaHost + ":11434");

        this.qwenModel = OllamaChatModel.builder()
                .baseUrl("http://" + ollamaHost + ":11434")
                .modelName("qwen2.5:7b")
                .temperature(0.0) // 0.0 este ideal pentru decizii stricte, logice
                .format("json")   // MAGIC WORD: Forțează modelul să răspundă doar în JSON
                .build();

        // Facem un test automat chiar când pornește aplicația Spring Boot
        testAiConnection();
    }

    /**
     * Testează rapid conexiunea la startup pentru a te asigura că JSON-ul merge.
     */
    private void testAiConnection() {
        System.out.println("⏳ Testăm conexiunea cu Qwen 2.5 (Cerem un JSON de test)...");
        String testPrompt = "Ești un asistent de test. Generează exact acest JSON și nimic altceva: { \"status\": \"AI Conectat\", \"viteza_ms\": 100 }";

        try {
            long startTime = System.currentTimeMillis();
            String response = qwenModel.generate(testPrompt);
            long endTime = System.currentTimeMillis();

            System.out.println("✅ Conexiune AI reușită în " + (endTime - startTime) + " ms!");
            System.out.println("📦 Răspuns primit (JSON pur): \n" + response);
        } catch (Exception e) {
            System.err.println("❌ Eroare la testarea conexiunii AI! Verifică dacă Ollama rulează.");
        }
    }

    /**
     * Metoda principala pe care o apelam pentru fiecare masina din intersecție
     */
    public String decideAction(String vehicleId, String contextV2x) {
        // Folosim Text Blocks (""") din Java pentru a scrie un prompt clar
        String prompt = """
                Ești sistemul central de siguranță V2X. Analizează situația pentru vehiculul %s.
                Situație trafic: %s
                
                Returnează decizia ta STRICT în format JSON, folosind exact această structură:
                {
                  "actiune": "ACCELEREAZA" | "FRANEAZA" | "ASTEAPTA",
                  "motiv": "explicație scurtă a deciziei"
                }
                """.formatted(vehicleId, contextV2x);

        try {
            // Trimitem datele la modelul Qwen
            String decisionJson = qwenModel.generate(prompt);
            return decisionJson.trim();
        } catch (Exception e) {
            System.err.println("⚠️ Eroare comunicare cu AI pentru " + vehicleId + ". Trecere pe avarie!");
            // Acum Fallback-ul trebuie să fie tot un JSON valid, ca să nu crape aplicația
            return "{ \"actiune\": \"FRANEAZA\", \"motiv\": \"Eroare conexiune AI sau Timeout\" }";
        }
    }
}