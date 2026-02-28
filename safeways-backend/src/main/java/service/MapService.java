package service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.dataformat.xml.XmlMapper;
import model.xml.CityMap;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;

@Service
public class MapService {

    private CityMap cityMap;

    @PostConstruct
    public void init() {
        try {
            XmlMapper xmlMapper = new XmlMapper();
            // Ignorăm orice tag-uri extra care ar putea apărea în XML
            xmlMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

            // Citim fisierul din folderul resources
            InputStream inputStream = new ClassPathResource("Harta_Luxemburg.xml").getInputStream();
            this.cityMap = xmlMapper.readValue(inputStream, CityMap.class);

            System.out.println("✅ Harta a fost parsată cu succes!");
            System.out.println("📍 Noduri (Intersecții): " + cityMap.getNodes().size());
            System.out.println("🛣️ Arce (Străzi): " + cityMap.getArcs().size());

        } catch (Exception e) {
            System.err.println("⚠️ Eroare la parsarea hartii XML: " + e.getMessage());
        }
    }

    public CityMap getMap() {
        return cityMap;
    }
}