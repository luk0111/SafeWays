package com.safeways.backend.service;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry config) {
        // Activăm un broker simplu în memorie pentru a trimite mesaje pe rutele care încep cu "/topic"
        // Frontend-ul tău se abonează exact la "/topic/decisions"
        config.enableSimpleBroker("/topic");

        // (Opțional) Prefixul pentru mesajele pe care le-ar trimite clientul către server
        config.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Aici înregistrăm endpoint-ul specificat în v2xService.js
        registry.addEndpoint("/v2x-stream")
                .setAllowedOriginPatterns("*"); // Permitem accesul de la orice origine (ex: localhost:5173 - React/Vite)
    }
}