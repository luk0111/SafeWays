package com.safeways.backend.service;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // 1. Activăm CORS general pentru a permite frontend-ului (port 5173) să facă cereri
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))

                // 2. Oprim temporar protecția CSRF (necesar când folosim frontend separat în dezvoltare)
                .csrf(csrf -> csrf.disable())

                // 3. Spunem care rute sunt publice și care necesită logare
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/map/**", "/v2x-stream/**").permitAll() // Lăsăm deschis pentru hartă și WebSockets
                        .anyRequest().authenticated() // Orice altă rută necesită autentificare
                );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Arrays.asList("*")); // Permitem orice frontend (ex: http://localhost:5173)
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Arrays.asList("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration); // Aplicăm regulile CORS peste tot
        return source;
    }
}