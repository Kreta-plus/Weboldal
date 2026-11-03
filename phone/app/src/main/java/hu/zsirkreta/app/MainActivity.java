package hu.kretaplusz.app;

import android.animation.ObjectAnimator;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import hu.kretaplusz.app.data.Kreta;
import hu.kretaplusz.app.data.St;
import hu.kretaplusz.app.data.Store;
import hu.kretaplusz.app.ui.AbsencesScreen;
import hu.kretaplusz.app.ui.DashboardScreen;
import hu.kretaplusz.app.ui.GradesScreen;
import hu.kretaplusz.app.ui.HomeworkScreen;
import hu.kretaplusz.app.ui.LoginScreen;
import hu.kretaplusz.app.ui.NamesScreen;
import hu.kretaplusz.app.ui.NotesScreen;
import hu.kretaplusz.app.ui.PackScreen;
import hu.kretaplusz.app.ui.PlannerScreen;
import hu.kretaplusz.app.ui.Screen;
import hu.kretaplusz.app.ui.SettingsScreen;
import hu.kretaplusz.app.ui.StatsScreen;
import hu.kretaplusz.app.ui.Theme;
import hu.kretaplusz.app.ui.TimetableScreen;
import hu.kretaplusz.app.ui.Ui;
import hu.kretaplusz.app.ui.WebLoginActivity;
import hu.kretaplusz.app.util.Async;
import hu.kretaplusz.app.util.Dt;

/**
 * Az egyetlen fő activity: felső sáv, tartalom (húzásra frissítés), alsó navigáció. A nézeteket
 * programból építjük, hogy a felhasználó témája (szín, lekerekítés, sűrűség, betűméret) futás közben váltható legyen.
 */
public class MainActivity extends AppCompatActivity {
    public static final String[] KEYS = {"dashboard", "grades", "stats", "timetable", "homework", "absences", "planner", "pack", "notes", "names", "settings"};
    public static final String[] LABELS = {"Kezdőlap", "Jegyek", "Statisztika", "Órarend", "Házi", "Hiányzás", "Tervező", "Táska", "Feljegyzések", "Nevek", "Beállítások"};
    private static final int[] ICONS = {R.drawable.ic_home, R.drawable.ic_book, R.drawable.ic_chart, R.drawable.ic_calendar, R.drawable.ic_assignment,
            R.drawable.ic_clock, R.drawable.ic_playlist_add, R.drawable.ic_bag, R.drawable.ic_chat, R.drawable.ic_label, R.drawable.ic_settings};
    private static final String[] PRIMARY = {"dashboard", "grades", "timetable", "homework"};   // alsó sáv; a többi a „Továbbiak” lapon

    private FrameLayout frame;
    private LinearLayout shell;
    private SwipeRefreshLayout swipe;
    private ScrollView scroll;
    private Ui.MaxWidthLayout content;
    private LinearLayout bottomBar;
    private TextView titleView, freshView, avatarView;
    private ImageView syncIcon;
    private ObjectAnimator spin;

    private String current = "dashboard";
    private Screen screen;
    private boolean inApp = false, refreshing = false, bootLoading = false;
    private ActivityResultLauncher<Intent> webLogin;
    private WebLoginHandler webLoginHandler;
    private ActivityResultLauncher<String> exportLauncher;
    private ActivityResultLauncher<String[]> importLauncher;
    private String pendingExport;
    private java.util.function.Consumer<String> importCb;

    public interface WebLoginHandler { void onResult(String code, String verifier, String error); }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        webLogin = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            WebLoginHandler h = webLoginHandler;
            webLoginHandler = null;
            if (h == null) return;
            Intent d = r.getData();
            if (r.getResultCode() == RESULT_OK && d != null) h.onResult(d.getStringExtra("code"), d.getStringExtra("verifier"), null);
            else h.onResult(null, null, d != null ? d.getStringExtra("error") : null);
        });
        exportLauncher = registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), uri -> {
            String text = pendingExport;
            pendingExport = null;
            if (uri == null || text == null) return;
            try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                os.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                toast("Exportálva");
            } catch (Exception e) { toast("Az exportálás nem sikerült: " + e.getMessage()); }
        });
        importLauncher = registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
            java.util.function.Consumer<String> cb = importCb;
            importCb = null;
            if (uri == null || cb == null) return;
            try (java.io.InputStream is = getContentResolver().openInputStream(uri); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) > 0) { out.write(buf, 0, n); if (out.size() > 2_000_000) throw new java.io.IOException("túl nagy fájl"); }
                cb.accept(out.toString("UTF-8"));
            } catch (Exception e) { toast("Érvénytelen fájl"); }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (inApp && !current.equals(St.prefs.startView)) show(St.prefs.startView);
                else { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); }
            }
        });
        Store.Account a = Store.account();
        if (a == null) showLogin(null);
        else enterApp();
    }

    @Override public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        if (inApp) { if (St.prefs.theme.equals("auto")) restyle(); else rerender(); }
        else showLogin(null);
    }

    @Override protected void onPause() {
        super.onPause();
        St.flushNow();
    }

    private boolean systemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    // ---------- belépés ----------
    public void showLogin(String message) {
        inApp = false;
        screen = null;
        St.reset();
        Theme.apply(St.prefs, systemDark());
        paintWindow();
        FrameLayout root = newFrame();
        root.addView(new LoginScreen(this, message, this::enterApp).build(), new FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH));
        setContentView(root);
        ViewCompat.requestApplyInsets(root);
    }

    /** Szöveg mentése a felhasználó által választott fájlba (beállítások exportja). */
    public void exportText(String filename, String text) {
        pendingExport = text;
        exportLauncher.launch(filename);
    }

    /** Fájl kiválasztása és tartalmának átadása (beállítások importja). */
    public void importText(java.util.function.Consumer<String> cb) {
        importCb = cb;
        importLauncher.launch(new String[]{"application/json", "text/plain", "*/*"});
    }

    public void launchWebLogin(String authUrl, String verifier, WebLoginHandler h) {
        webLoginHandler = h;
        Intent i = new Intent(this, WebLoginActivity.class);
        i.putExtra("url", authUrl);
        i.putExtra("verifier", verifier);
        webLogin.launch(i);
    }

    // ---------- az alkalmazás ----------
    public void enterApp() {
        Store.Account a = Store.account();
        if (a == null) { showLogin(null); return; }
        St.reset();
        St.prefs = Store.loadPrefs(a.ukey);
        inApp = true;
        current = St.prefs.startView;
        buildShell();
        bootLoading = true;
        show(current);
        Async.run(St::cachedBundle, cached -> {
            if (!inApp) return;
            St.applyBundle(cached, false);
            if (!St.raw.isEmpty()) bootLoading = false;
            rerender();
            refresh(false);
        }, e -> refresh(false));
    }

    public Screen currentScreen() { return screen; }
    public boolean isLoading() { return bootLoading && St.raw.isEmpty(); }

    private FrameLayout newFrame() {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(bgDrawable());
        ViewCompat.setOnApplyWindowInsetsListener(f, (v, insets) -> {
            Insets sb = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sb.left, sb.top, sb.right, Math.max(sb.bottom, ime.bottom));
            if (bottomBar != null) bottomBar.setVisibility(ime.bottom > Ui.dp(120) ? View.GONE : View.VISIBLE);
            return WindowInsetsCompat.CONSUMED;
        });
        return f;
    }

    /** Alap háttér + halvány kiemelő színű "fény" a jobb felső sarokban (mint a webes háttér). */
    private GradientDrawable bgDrawable() {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{Theme.mix(Theme.bg, Theme.accent, Theme.dark ? 0.12f : 0.07f), Theme.bg, Theme.bg});
        return g;
    }

    private void paintWindow() {
        getWindow().getDecorView().setBackgroundColor(Theme.bg);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!Theme.dark);
        c.setAppearanceLightNavigationBars(!Theme.dark);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
    }

    private boolean restyleQueued = false;

    /**
     * Téma változott (szín, lekerekítés, betűméret …): az egész felület újraépül.
     * Sosem szinkron: a hívó (pl. egy csúszka vagy gomb) még a saját érintés-/kattintáskezelésében van, és a nézetfa
     * közbeni lecserélése összeomlást okozott. Egymás utáni kérések egyetlen újraépítéssé olvadnak.
     */
    public void restyle() {
        if (!inApp || restyleQueued) return;
        restyleQueued = true;
        Async.ui(() -> {
            restyleQueued = false;
            if (inApp) restyleNow();
        });
    }

    private void restyleNow() {
        int y = scroll != null ? scroll.getScrollY() : 0;
        buildShell();
        show(current, false);
        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void buildShell() {
        Theme.apply(St.prefs, systemDark());
        paintWindow();
        frame = newFrame();
        shell = Ui.vbox(this, 0);

        // felső sáv
        LinearLayout top = Ui.hbox(this, 12);
        top.setPadding(Ui.dp(16), Ui.dp(8), Ui.dp(8), Ui.dp(4));
        LinearLayout titles = Ui.vbox(this, 2);
        titleView = Ui.text(this, "", 22, Theme.text, true);
        freshView = Ui.small(this, "");
        titles.addView(titleView, Ui.lp(Ui.WRAP, Ui.WRAP));
        titles.addView(freshView, Ui.lp(Ui.WRAP, Ui.WRAP));
        top.addView(titles, Ui.grow());
        FrameLayout sync = Ui.iconButton(this, R.drawable.ic_refresh, Theme.muted, () -> refresh(true));
        syncIcon = (ImageView) sync.getChildAt(0);
        top.addView(sync);
        avatarView = Ui.text(this, St.prefs.emoji, 18, Theme.text, false);
        avatarView.setGravity(Gravity.CENTER);
        avatarView.setBackground(Ui.ripple(Ui.shape(Theme.accentSoft, 14, Theme.border, 1), 14));
        avatarView.setOnClickListener(v -> show("settings"));
        top.addView(avatarView, Ui.lp(Ui.dp(40), Ui.dp(40)));
        shell.addView(top, Ui.lp(Ui.MATCH, Ui.WRAP));

        // tartalom
        swipe = new SwipeRefreshLayout(this);
        swipe.setColorSchemeColors(Theme.accent);
        swipe.setProgressBackgroundColorSchemeColor(Theme.surface);
        swipe.setOnRefreshListener(() -> refresh(true));
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        content = new Ui.MaxWidthLayout(this, 680);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setDividerDrawable(Ui.gap(Theme.gap, true));
        content.setShowDividers(LinearLayout.SHOW_DIVIDER_MIDDLE);
        content.setPadding(Ui.dp(16), Ui.dp(8), Ui.dp(16), Ui.dp(24));
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(Ui.MATCH, Ui.WRAP, Gravity.CENTER_HORIZONTAL);
        FrameLayout holder = new FrameLayout(this);
        holder.addView(content, clp);
        scroll.addView(holder, new ScrollView.LayoutParams(Ui.MATCH, Ui.WRAP));
        swipe.addView(scroll, new SwipeRefreshLayout.LayoutParams(Ui.MATCH, Ui.MATCH));
        shell.addView(swipe, Ui.lp(Ui.MATCH, 0, 1f));

        // alsó sáv
        bottomBar = Ui.hbox(this, 0);
        bottomBar.setBackgroundColor(Theme.withAlpha(Theme.surface, 0.97f));
        bottomBar.setPadding(Ui.dp(4), Ui.dp(6), Ui.dp(4), Ui.dp(6));
        View line = Ui.divider(this);
        shell.addView(line);
        shell.addView(bottomBar, Ui.lp(Ui.MATCH, Ui.WRAP));
        drawBottomBar();

        frame.addView(shell, new FrameLayout.LayoutParams(Ui.MATCH, Ui.MATCH));
        setContentView(frame);
        ViewCompat.requestApplyInsets(frame);
    }

    private int indexOf(String key) { return Arrays.asList(KEYS).indexOf(key); }

    private void drawBottomBar() {
        bottomBar.removeAllViews();
        List<String> primary = new ArrayList<>(Arrays.asList(PRIMARY));
        for (String k : primary) bottomBar.addView(navItem(ICONS[indexOf(k)], LABELS[indexOf(k)], k.equals(current), () -> show(k)), Ui.lp(0, Ui.WRAP, 1f));
        boolean moreOn = !primary.contains(current);
        bottomBar.addView(navItem(R.drawable.ic_more, "Továbbiak", moreOn, this::openMore), Ui.lp(0, Ui.WRAP, 1f));
    }

    private View navItem(int icon, String label, boolean on, Runnable r) {
        LinearLayout l = Ui.vbox(this, 3);
        l.setGravity(Gravity.CENTER_HORIZONTAL);
        l.setPadding(0, Ui.dp(2), 0, Ui.dp(2));
        FrameLayout pill = new FrameLayout(this);
        pill.setBackground(on ? Ui.shape(Theme.accentSoft, 16) : null);
        ImageView iv = new ImageView(this);
        iv.setImageResource(icon);
        iv.setColorFilter(on ? Theme.accent : Theme.muted);
        pill.addView(iv, new FrameLayout.LayoutParams(Ui.dp(24), Ui.dp(24), Gravity.CENTER));
        l.addView(pill, Ui.lp(Ui.dp(56), Ui.dp(32)));
        TextView t = Ui.text(this, label, 11, on ? Theme.text : Theme.muted, on);
        t.setSingleLine(true);
        l.addView(t, Ui.lp(Ui.WRAP, Ui.WRAP));
        l.setBackground(Ui.ripple(Ui.shape(Color.TRANSPARENT, 14), 14));
        l.setOnClickListener(v -> r.run());
        return l;
    }

    private void openMore() {
        Ui.Sheet s = Ui.sheet(this, "Továbbiak");
        LinearLayout grid = Ui.vbox(this, 10);
        String[] more = {"stats", "absences", "planner", "pack", "notes", "names", "settings"};
        for (int i = 0; i < more.length; i += 2) {
            LinearLayout row = Ui.hbox(this, 10);
            for (int j = i; j < Math.min(i + 2, more.length); j++) {
                final String k = more[j];
                int idx = indexOf(k);
                LinearLayout tile = Ui.hbox(this, 12);
                boolean on = k.equals(current);
                tile.setBackground(Ui.ripple(Ui.shape(on ? Theme.accentSoft : Theme.surface2, 14, Theme.border, 1), 14));
                tile.setPadding(Ui.dp(14), Ui.dp(14), Ui.dp(14), Ui.dp(14));
                tile.addView(Ui.icon(this, ICONS[idx], on ? Theme.accent : Theme.muted, 24));
                tile.addView(Ui.text(this, LABELS[idx], 15, Theme.text, true), Ui.grow());
                tile.setOnClickListener(v -> { s.dismiss(); show(k); });
                row.addView(tile, Ui.lp(0, Ui.WRAP, 1f));
            }
            if (row.getChildCount() == 1) row.addView(new View(this), Ui.lp(0, 1, 1f));
            grid.addView(row, Ui.lp(Ui.MATCH, Ui.WRAP));
        }
        s.body.addView(grid, Ui.lp(Ui.MATCH, Ui.WRAP));
        s.show();
    }

    // ---------- navigáció és megjelenítés ----------
    public void show(String key) { show(key, true); }

    private Screen make(String key) {
        switch (key) {
            case "grades": return new GradesScreen(this);
            case "stats": return new StatsScreen(this);
            case "timetable": return new TimetableScreen(this);
            case "homework": return new HomeworkScreen(this);
            case "absences": return new AbsencesScreen(this);
            case "planner": return new PlannerScreen(this);
            case "pack": return new PackScreen(this);
            case "notes": return new NotesScreen(this);
            case "names": return new NamesScreen(this);
            case "settings": return new SettingsScreen(this);
            default: return new DashboardScreen(this);
        }
    }

    private void show(String key, boolean animate) {
        if (indexOf(key) < 0) key = "dashboard";
        boolean changed = !key.equals(current) || screen == null;
        current = key;
        screen = make(key);
        drawBottomBar();
        titleView.setText(key.equals("dashboard") ? "KRÉTA Plusz" : LABELS[indexOf(key)]);
        draw();
        updateFresh();
        if (changed) scroll.scrollTo(0, 0);
        if (animate && changed) {
            content.setAlpha(0f);
            content.setTranslationY(Ui.dp(10));
            content.animate().alpha(1f).translationY(0).setDuration(180).start();
        }
    }

    private void draw() {
        content.removeAllViews();
        if (isLoading()) {
            for (int i = 0; i < 3; i++) content.addView(skeleton(), Ui.lp(Ui.MATCH, Ui.dp(96)));
            return;
        }
        try {
            screen.render(content);
        } catch (RuntimeException e) {
            content.removeAllViews();
            LinearLayout card = Ui.card(this);
            card.addView(Ui.muted(this, "Hiba a megjelenítésben: " + e));
            content.addView(card, Ui.lp(Ui.MATCH, Ui.WRAP));
            android.util.Log.e("KretaPlusz", "render", e);
        }
    }

    private View skeleton() {
        View v = new View(this);
        v.setBackground(Ui.shape(Theme.surface, Theme.radius));
        ObjectAnimator a = ObjectAnimator.ofFloat(v, View.ALPHA, 0.45f, 1f);
        a.setDuration(800);
        a.setRepeatMode(ObjectAnimator.REVERSE);
        a.setRepeatCount(ObjectAnimator.INFINITE);
        v.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View x) { a.start(); }
            @Override public void onViewDetachedFromWindow(View x) { a.cancel(); }
        });
        return v;
    }

    /** Újrarajzolás a görgetési pozíció megtartásával. */
    public void rerender() {
        if (!inApp || screen == null) return;
        int y = scroll.getScrollY();
        draw();
        updateFresh();
        scroll.post(() -> scroll.scrollTo(0, y));
    }

    private void updateFresh() {
        Double f = St.freshest();
        freshView.setText(f != null ? "frissítve " + Dt.ago(f) : "");
        freshView.setVisibility(f != null ? View.VISIBLE : View.GONE);
        avatarView.setText(St.prefs.emoji);
    }

    public void toast(String msg) { Ui.toast(this, msg); }

    // ---------- adatok frissítése ----------
    public void refresh(boolean force) {
        if (refreshing || !inApp) { if (swipe != null) swipe.setRefreshing(false); return; }
        refreshing = true;
        setSpinning(true);
        Async.run(() -> St.fetchBundle(force), b -> {
            refreshing = false;
            bootLoading = false;
            setSpinning(false);
            if (swipe != null) swipe.setRefreshing(false);
            if (!inApp) return;
            if (b.relogin != null) {
                showLogin("Lejárt a belépés, jelentkezz be újra");
                return;
            }
            if (force) St.weekCache.clear();
            St.applyBundle(b, true);
            if (!St.errors.isEmpty()) toast("Nem minden adat töltődött be (" + String.join(", ", St.errors.keySet()) + ")");
            else if (force) toast("Frissítve");
            rerender();
        }, e -> {
            refreshing = false;
            bootLoading = false;
            setSpinning(false);
            if (swipe != null) swipe.setRefreshing(false);
            rerender();
            toast(e.getMessage() == null ? "Hiba a frissítéskor" : e.getMessage());
        });
    }

    private void setSpinning(boolean on) {
        if (syncIcon == null) return;
        if (on) {
            spin = ObjectAnimator.ofFloat(syncIcon, View.ROTATION, 0f, 360f);
            spin.setDuration(900);
            spin.setInterpolator(new LinearInterpolator());
            spin.setRepeatCount(ObjectAnimator.INFINITE);
            spin.start();
        } else if (spin != null) {
            spin.cancel();
            syncIcon.setRotation(0);
        }
    }

    /** Kilépés (a beállításokból): vissza a belépő képernyőre. */
    public void logout(boolean deleteData) {
        St.flushNow();
        if (deleteData) Store.deleteAll(); else Store.logout();
        showLogin(null);
    }
}
