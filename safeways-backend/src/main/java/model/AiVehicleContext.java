package model;

import lombok.Data;

@Data
public class AiVehicleContext {

    // --- MEMORIA PROPRIE (Date fizice statice ale mașinii) ---
    private String vehicleId;
    private double weightKg; // Greutatea (ex: 1500 kg, 7500 kg)
    private double maxAcceleration; // Cât de repede prinde viteză (m/s^2)
    private double maxDeceleration; // Cât de repede poate pune frână (m/s^2)

    // --- STAREA CURENTĂ (Date dinamice primite din V2xMessage) ---
    private double currentSpeed;
    private V2xMessage.Position currentPosition;
    private Intention currentIntention;

    /**
     * Metodă utilitară pentru a genera contextul perfect pentru modelul Qwen
     */
    public String generatePromptContext() {
        return String.format(
                "Vehicul: %s (%s). Greutate: %.0f kg. Frânare max: %.2f m/s^2. " +
                        "Stare curentă: Viteză %.1f km/h, Intenție: %s, Coordonate: X=%.1f Y=%.1f.", vehicleId, weightKg, maxDeceleration,
                currentSpeed, currentIntention, currentPosition.getX(), currentPosition.getY()
        );
    }
}