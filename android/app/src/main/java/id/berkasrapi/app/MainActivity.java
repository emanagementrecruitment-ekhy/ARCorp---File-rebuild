package id.berkasrapi.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
