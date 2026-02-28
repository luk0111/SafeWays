package model;

import lombok.Data;

@Data
public class V2xMessage {
    private String vehicleId;
    private String vehicleType;

    // Viteza exactă scoasă din computerul de bord
    private double speed;

    // Poziția calculată prin triangularea antenelor (ex: 3 semafoare)
    private Position position;

    // Intenția mapată automat la Enum-ul nostru
    private com.safeways.backend.model.Intention intention;

    private String status;

    @Data
    public static class Position {
        private double x;
        private double y;
    }
}