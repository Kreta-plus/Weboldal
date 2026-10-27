package hu.kretaplusz.app;

import android.app.Application;

import hu.kretaplusz.app.data.Config;
import hu.kretaplusz.app.data.Store;
import hu.kretaplusz.app.ui.Ui;

public class App extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Ui.init(this);
        Config.init(this);
        Store.init(this);
    }
}
