package model.xml;

import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlProperty;
import lombok.Data;

@Data
public class MapArc {
    @JacksonXmlProperty(isAttribute = true)
    private String from;

    @JacksonXmlProperty(isAttribute = true)
    private String to;

    @JacksonXmlProperty(isAttribute = true)
    private double length;
}