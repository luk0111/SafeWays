package com.safeways.backend.service;

import com.safeways.backend.model.WeatherCondition;
import com.safeways.backend.model.vehicle.Vehicle;

public class CollisionPredictor {

    public static class Prediction {
        public double timeToArrivalNormal;
        public double timeToArrivalAccelerated;
        public boolean cannotStopPhysically;
        public double[] collisionPoint;
        public double distanceToCollision;

        public Prediction(double timeNormal, double timeAccel, boolean cannotStop,
                         double[] collisionPoint, double distance) {
            this.timeToArrivalNormal = timeNormal;
            this.timeToArrivalAccelerated = timeAccel;
            this.cannotStopPhysically = cannotStop;
            this.collisionPoint = collisionPoint;
            this.distanceToCollision = distance;
        }
    }

    public static class VehicleState2D {
        public double x, y;
        public double vx, vy;
        public double speedKmH;
        public double weightKg;
        public double baseBrakingCapability;

        public VehicleState2D(double x, double y, double vx, double vy,
                              double speedKmH, double weightKg, double brakingCapability) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.speedKmH = speedKmH;
            this.weightKg = weightKg;
            this.baseBrakingCapability = brakingCapability;
        }

        public static VehicleState2D fromVehicleWithDirection(double x, double y, double rotation,
                                                               double speedKmH, double weightKg,
                                                               double brakingCapability) {
            double speedMs = speedKmH / 3.6;
            double vx = Math.cos(rotation) * speedMs;
            double vy = Math.sin(rotation) * speedMs;
            return new VehicleState2D(x, y, vx, vy, speedKmH, weightKg, brakingCapability);
        }
    }

    public static class CollisionResult {
        public boolean collisionDetected;
        public double timeToCollision;
        public double[] collisionPoint;
        public Prediction predictionV1;
        public Prediction predictionV2;

        public CollisionResult(boolean detected, double time, double[] point,
                               Prediction p1, Prediction p2) {
            this.collisionDetected = detected;
            this.timeToCollision = time;
            this.collisionPoint = point;
            this.predictionV1 = p1;
            this.predictionV2 = p2;
        }
    }

    /**
     * Calculate kinematics for a vehicle towards a 2D target point
     */
    public static Prediction calculateKinematics2D(VehicleState2D v, double targetX, double targetY,
                                                    WeatherCondition weather) {
        double dx = targetX - v.x;
        double dy = targetY - v.y;
        double distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 0.001) {
            return new Prediction(0, 0, false, new double[]{targetX, targetY}, 0);
        }

        double initialSpeedMs = v.speedKmH / 3.6;

        double gripFactor = getGripFactor(weather);

        double brakingDecel = v.baseBrakingCapability * gripFactor;
        double acceleration = ((v.weightKg > 3500) ? 1.0 : 3.0) * gripFactor;

        double dirX = dx / distance;
        double dirY = dy / distance;
        double speedTowardsTarget = v.vx * dirX + v.vy * dirY;

        double timeToArrivalNormal = (speedTowardsTarget > 0.01) ? distance / speedTowardsTarget : 999;

        double timeAccelerated = calculateAccelerationTime(distance, speedTowardsTarget, acceleration);

        double minStoppingDistance = (speedTowardsTarget * speedTowardsTarget) / (2 * brakingDecel);
        boolean cannotStop = (distance < minStoppingDistance) && (speedTowardsTarget > 0);

        return new Prediction(timeToArrivalNormal, timeAccelerated, cannotStop,
                             new double[]{targetX, targetY}, distance);
    }

    /**
     * Detect potential collision between 2 vehicles in 2D space
     */
    public static CollisionResult detectCollision2D(VehicleState2D v1, VehicleState2D v2,
                                                     double collisionRadius, double timeHorizonSeconds,
                                                     WeatherCondition weather) {
        double timeStep = 0.1; // 100ms granularity

        for (double t = 0; t <= timeHorizonSeconds; t += timeStep) {
            double x1 = v1.x + v1.vx * t;
            double y1 = v1.y + v1.vy * t;
            double x2 = v2.x + v2.vx * t;
            double y2 = v2.y + v2.vy * t;

            double dist = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));

            if (dist < collisionRadius * 2) {
                double[] collisionPoint = new double[]{(x1 + x2) / 2, (y1 + y2) / 2};

                Prediction pred1 = calculateKinematics2D(v1, collisionPoint[0], collisionPoint[1], weather);
                Prediction pred2 = calculateKinematics2D(v2, collisionPoint[0], collisionPoint[1], weather);

                return new CollisionResult(true, t, collisionPoint, pred1, pred2);
            }
        }

        return new CollisionResult(false, -1, null, null, null);
    }

    /**
     * Detect collisions among multiple vehicles
     */
    public static CollisionResult detectMultiVehicleCollision(VehicleState2D[] vehicles,
                                                               double collisionRadius,
                                                               double timeHorizonSeconds,
                                                               WeatherCondition weather) {
        for (int i = 0; i < vehicles.length; i++) {
            for (int j = i + 1; j < vehicles.length; j++) {
                CollisionResult result = detectCollision2D(vehicles[i], vehicles[j],
                                                           collisionRadius, timeHorizonSeconds, weather);
                if (result.collisionDetected) {
                    return result;
                }
            }
        }
        return new CollisionResult(false, -1, null, null, null);
    }

    private static double getGripFactor(WeatherCondition weather) {
        if (weather == WeatherCondition.RAIN) return 0.7;
        if (weather == WeatherCondition.SNOW) return 0.4;
        return 1.0;
    }

    private static double calculateAccelerationTime(double distance, double initialSpeed, double acceleration) {
        double discriminant = (initialSpeed * initialSpeed) + 2 * acceleration * distance;
        if (discriminant < 0) return 999;
        double time = (-initialSpeed + Math.sqrt(discriminant)) / acceleration;
        return (Double.isNaN(time) || time < 0) ? 999 : time;
    }

    /**
     * Legacy 1D method for backward compatibility
     */
    @Deprecated
    public static Prediction calculateKinematics(Vehicle v, WeatherCondition weather) {
        double initialSpeedMs = v.getVitezaKmH() / 3.6;
        double distance = v.getDistantaPanaLaNod();

        double gripFactor = getGripFactor(weather);
        double brakingDecel = v.getCapabilitateFranareBaza() * gripFactor;
        double acceleration = ((v.getGreutateKg() > 3500) ? 1.0 : 3.0) * gripFactor;

        double timeToArrivalNormal = distance / initialSpeedMs;
        double timeAccelerated = calculateAccelerationTime(distance, initialSpeedMs, acceleration);

        double minStoppingDistance = (initialSpeedMs * initialSpeedMs) / (2 * brakingDecel);
        boolean cannotStop = (distance < minStoppingDistance);

        return new Prediction(timeToArrivalNormal, timeAccelerated, cannotStop, null, distance);
    }
}