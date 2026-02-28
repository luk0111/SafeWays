package com.safeways.backend.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;

@Service
public class V2XMessage {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    // Exemplu: Trimite un mesaj de test imediat după pornire pentru a verifica conexiunea
    @PostConstruct
    public void sendTestMessage() {
        new Thread(() -> {
            try {
                Thread.sleep(5000); // Așteptăm 5 secunde să aibă timp frontend-ul să se conecteze
                String mockDecision = "{\"status\": \"success\", \"message\": \"Acesta este un mesaj de test de la AI\"}";
                messagingTemplate.convertAndSend("/topic/decisions", mockDecision);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }).start();
    }
}