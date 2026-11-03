package hu.zsirkreta.app;

import android.app.Application;

import hu.zsirkreta.app.data.Config;
import hu.zsirkreta.app.data.Store;
import hu.zsirkreta.app.ui.Ui;

public class App extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Ui.init(this);
        Config.init(this);
        Store.init(this);
    }
}
