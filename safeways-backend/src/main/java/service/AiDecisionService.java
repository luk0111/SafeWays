package service;

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
                .temperature(0.1)
                .build();
    }

    /**
     * Metoda principala pe care o apelam pentru fiecare masina din intersecție
     */
    public String decideAction(String vehicleId, String contextV2x) {
        String prompt = "Ești agentul autonom pentru vehiculul " + vehicleId + ".\n" +
                "Situație trafic: " + contextV2x + "\n" +
                "Răspunde DOAR cu unul dintre următoarele cuvinte: [ACCELEREAZA], [FRANEAZA], [ASTEAPTA].";

        try {
            // Trimitem datele la modelul Qwen de pe laptopul prietenului
            String decision = qwenModel.generate(prompt);
            return decision.trim();
        } catch (Exception e) {
            // Mecanism de (Fallback)
            System.err.println("⚠️ Eroare comunicare cu AI pentru " + vehicleId + ". Trecere pe avarie! Motiv: " + e.getMessage());
            return "[FRANEAZA]"; // Default safe action pentru a evita coliziunea
        }
    }
}