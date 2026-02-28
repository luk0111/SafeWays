package com.safeways.backend.service;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.ollama.OllamaChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

import java.util.concurrent.CompletableFuture;

@Service
public class AiDecisionService {

    private ChatLanguageModel qwenModel;

    @Value("${ollama.host:localhost}")
    private String ollamaHost;

    @PostConstruct
    public void init() {
        this.qwenModel = OllamaChatModel.builder()
                .baseUrl("http://" + ollamaHost + ":11434")
                .modelName("qwen2.5:7b")
                .temperature(0.0)
                .format("json")
                .build();
    }

    public CompletableFuture<String> decideForIntersectionBatchAsync(String intersectionId, String batchContext) {
        return CompletableFuture.supplyAsync(() -> {
            String prompt = """
                    Ești sistemul de decizie V2X pentru intersecția %s.
                    Analizează situația vehiculelor (timpul sosirii dacă mențin ruta și timpul dacă accelerează la maximum).
                    
                    Situație:
                    %s
                    
                    Returnează STRICT un ARRAY JSON. Structura:
                     [
                       {
                         "vehicleId": "ID",
                         "actiune": "CONTINUA" | "OPRESTE" | "INCETINESTE" | "ACCELEREAZA",
                         "vitezaTintaKmH": 0, // Pune viteza recomandată AICI (ex: 20 pentru INCETINESTE, 0 pentru OPRESTE)
                         "motiv": "explicație bazată pe fizică"
                       }
                     ]
                    """.formatted(intersectionId, batchContext);
            try {
                return qwenModel.generate(prompt).trim();
            } catch (Exception e) {
                return "[]";
            }
        });
    }
}