package com.safeways.backend.controller;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
public class AiProxyController {

    private static final String OLLAMA_BASE_URL = "http://192.168.104.42:11434";

    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/generate")
    public ResponseEntity<?> generateProxy(@RequestBody Map<String, Object> request) {
        try {
            System.out.println("🤖 AI Proxy: Forwarding request to Ollama at " + OLLAMA_BASE_URL);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(request, headers);

            long startTime = System.currentTimeMillis();

            ResponseEntity<String> response = restTemplate.exchange(
                OLLAMA_BASE_URL + "/api/generate",
                HttpMethod.POST,
                entity,
                String.class
            );

            long elapsed = System.currentTimeMillis() - startTime;
            System.out.println("🤖 AI Proxy: Response received in " + elapsed + "ms");

            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            System.err.println("❌ AI Proxy Error: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body("{\"error\": \"" + e.getMessage().replace("\"", "'") + "\"}");
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> healthCheck() {
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(
                OLLAMA_BASE_URL + "/api/tags",
                String.class
            );
            return ResponseEntity.ok("{\"status\": \"connected\", \"ollama\": " + response.getBody() + "}");
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body("{\"status\": \"disconnected\", \"error\": \"" + e.getMessage().replace("\"", "'") + "\"}");
        }
    }
}
