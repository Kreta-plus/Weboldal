package hu.kretaplusz.app.ui;

import android.graphics.Color;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import hu.kretaplusz.app.data.Prefs;

/**
 * Futásidejű téma: a webes app CSS-változóinak (--bg, --surface, --accent, --g1…--g5, --radius …) megfelelője.
 * A felhasználó témája, kiemelő színe, sűrűsége, betűmérete és az „Egyedi stílus” változói alakítják.
 */
public final class Theme {
    private Theme() {}

    public static boolean dark;
    public static int bg, bg2, surface, surface2, border, text, muted;
    public static int accent, accentSoft, accentStrong, onAccent;
    public static final int[] g = new int[6];   // g[1] … g[5]: a jegyek színei
    public static float radius = 16, pad = 16, gap = 12, fs = 1f, borderW = 1f, kpiScale = 1f, cardAlpha = 1f;

    /** Az „Egyedi stílusban” használható változók (név, magyarázat). */
    public static final String[][] VARS = {
            {"--accent", "Kiemelő szín (pl. #ff5500)"},
            {"--bg", "Háttér"},
            {"--surface", "Kártyák háttere"},
            {"--surface2", "Listaelemek, beviteli mezők háttere"},
            {"--border", "Keretek színe"},
            {"--text", "Szöveg színe"},
            {"--muted", "Halványabb szöveg színe"},
            {"--g1", "1-es jegy színe"},
            {"--g2", "2-es jegy színe"},
            {"--g3", "3-as jegy színe"},
            {"--g4", "4-es jegy színe"},
            {"--g5", "5-ös jegy színe"},
            {"--radius", "Lekerekítés (pl. 4px)"},
            {"--card-alpha", "Kártyák átlátszatlansága (0–1, pl. 0.65: üveghatás)"},
            {"--border-width", "Keretvastagság (pl. 2px)"},
            {"--kpi-scale", "Nagy számok mérete (pl. 1.4)"},
    };

    public static final Map<String, String> CSS_PRESETS = new LinkedHashMap<>();
    static {
        CSS_PRESETS.put("Üveg", "--card-alpha: 0.65;");
        CSS_PRESETS.put("Éles sarkok", "--radius: 4px;");
        CSS_PRESETS.put("Neon keret", "--border: #6c5ce7;\n--border-width: 2px;");
        CSS_PRESETS.put("Nagy számok", "--kpi-scale: 1.4;");
    }

    public static int withAlpha(int c, float a) { return Color.argb(Math.round(a * 255), Color.red(c), Color.green(c), Color.blue(c)); }

    public static int mix(int a, int b, float t) {
        return Color.rgb(
                Math.round(Color.red(a) + (Color.red(b) - Color.red(a)) * t),
                Math.round(Color.green(a) + (Color.green(b) - Color.green(a)) * t),
                Math.round(Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
    }

    private static double luminance(int c) {
        double[] v = {Color.red(c) / 255.0, Color.green(c) / 255.0, Color.blue(c) / 255.0};
        for (int i = 0; i < 3; i++) v[i] = v[i] <= 0.03928 ? v[i] / 12.92 : Math.pow((v[i] + 0.055) / 1.055, 2.4);
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }

    public static void apply(Prefs p, boolean systemDark) {
        dark = p.theme.equals("dark") || p.theme.equals("amoled") || (p.theme.equals("auto") && systemDark);
        if (p.theme.equals("amoled")) {
            bg = 0xFF000000; bg2 = 0xFF000000; surface = 0xFF0B0B10; surface2 = 0xFF14141C; border = 0xFF23232F;
            text = 0xFFF2F2F7; muted = 0xFF8E8EA0;
        } else if (dark) {
            bg = 0xFF0D0E1A; bg2 = 0xFF12132A; surface = 0xFF171936; surface2 = 0xFF1E2145; border = 0xFF2A2D5A;
            text = 0xFFEEF0FF; muted = 0xFF9AA0CF;
        } else {
            bg = 0xFFF3F4FB; bg2 = 0xFFECEEFA; surface = 0xFFFFFFFF; surface2 = 0xFFF3F4FC; border = 0xFFDFE2F3;
            text = 0xFF1B1D3A; muted = 0xFF6A6F98;
        }
        g[5] = 0xFF2ECC8F; g[4] = 0xFF8BD450; g[3] = 0xFFF4C542; g[2] = 0xFFF39A3D; g[1] = 0xFFEF5B5B;
        accent = parseColor(p.accent, 0xFF6C5CE7);

        switch (p.density) {
            case "compact": pad = 12; gap = 8; break;
            case "cozy": pad = 20; gap = 16; break;
            default: pad = 16; gap = 12;
        }
        fs = (float) p.fontScale;
        radius = p.radius;
        borderW = 1f; kpiScale = 1f; cardAlpha = 1f;

        // Egyedi stílus: „--változó: érték;” párok (a szelektorokat és a kapcsos zárójeleket figyelmen kívül hagyjuk)
        Matcher m = Pattern.compile("--([a-zA-Z0-9-]+)\\s*:\\s*([^;{}]+)").matcher(p.customCss == null ? "" : p.customCss);
        while (m.find()) {
            String k = m.group(1).toLowerCase(), v = m.group(2).trim();
            Integer col = parseColorOrNull(v);
            switch (k) {
                case "accent": if (col != null) accent = col; break;
                case "bg": if (col != null) { bg = col; bg2 = col; } break;
                case "surface": if (col != null) surface = col; break;
                case "surface2": if (col != null) surface2 = col; break;
                case "border": if (col != null) border = col; break;
                case "text": if (col != null) text = col; break;
                case "muted": if (col != null) muted = col; break;
                case "g1": case "g2": case "g3": case "g4": case "g5": if (col != null) g[k.charAt(1) - '0'] = col; break;
                case "radius": { Float f = number(v); if (f != null) radius = Math.max(0, Math.min(40, f)); break; }
                case "card-alpha": { Float f = number(v); if (f != null) cardAlpha = Math.max(0.2f, Math.min(1f, f)); break; }
                case "border-width": { Float f = number(v); if (f != null) borderW = Math.max(0, Math.min(6, f)); break; }
                case "kpi-scale": { Float f = number(v); if (f != null) kpiScale = Math.max(0.6f, Math.min(2f, f)); break; }
                default: break;
            }
        }
        accentSoft = withAlpha(accent, 0.16f);
        accentStrong = mix(accent, Color.WHITE, 0.2f);
        onAccent = luminance(accent) > 0.45 ? 0xFF10121F : Color.WHITE;
    }

    private static Float number(String v) {
        Matcher m = Pattern.compile("^(-?\\d*\\.?\\d+)").matcher(v.trim());
        if (!m.find()) return null;
        try { return Float.parseFloat(m.group(1)); } catch (NumberFormatException e) { return null; }
    }

    public static int parseColor(String s, int def) {
        Integer c = parseColorOrNull(s);
        return c == null ? def : c;
    }

    /** #rgb, #rrggbb, #rrggbbaa (CSS-sorrend), rgb()/rgba() és az Android színnevei. */
    public static Integer parseColorOrNull(String s) {
        if (s == null) return null;
        s = s.trim();
        try {
            if (s.startsWith("#")) {
                String h = s.substring(1);
                if (h.length() == 3) h = "" + h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
                if (h.length() == 6) return Color.parseColor("#" + h);
                if (h.length() == 8) return Color.parseColor("#" + h.substring(6) + h.substring(0, 6));  // CSS: RRGGBBAA → ARGB
                return null;
            }
            Matcher m = Pattern.compile("rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*(?:,\\s*([\\d.]+)\\s*)?\\)", Pattern.CASE_INSENSITIVE).matcher(s);
            if (m.matches()) {
                float a = m.group(4) == null ? 1f : Float.parseFloat(m.group(4));
                return Color.argb(Math.round(a * 255), Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            }
            if (s.matches("[a-zA-Z]+")) return Color.parseColor(s.toLowerCase());
        } catch (IllegalArgumentException ignored) {}
        return null;
    }

    public static int gradeColor(Double v) {
        if (v == null) return accent;
        return g[Math.min(5, Math.max(1, (int) Math.round(v)))];
    }

    public static int onGrade(Double v) {
        if (v == null) return onAccent;
        return Math.round(v) <= 1 ? Color.WHITE : 0xFF10121F;
    }

    /** Tantárgyszín: stabil hash alapján (mint a webes subjColor). */
    public static int subjColor(String name) {
        int h = 0;
        for (int i = 0; i < name.length(); i++) h = h * 31 + name.charAt(i);
        long u = h & 0xFFFFFFFFL;
        float hue = (float) (u % 360);
        return Color.HSVToColor(new float[]{hue, dark ? 0.55f : 0.65f, dark ? 0.95f : 0.85f});
    }
}
