/**
 * Flipper disabled — its network plugin (FlipperOkhttpInterceptor) intercepts
 * OkHttp responses and silently hangs POST requests on Android 13 physical devices.
 * The server returns 200 but the response is never delivered to the JS layer.
 * This stub keeps the call site in MainApplication.java compiling without Flipper.
 */
package com.wealthtrack;

import android.content.Context;
import com.facebook.react.ReactInstanceManager;

public class ReactNativeFlipper {
  public static void initializeFlipper(Context context, ReactInstanceManager reactInstanceManager) {
    // No-op: Flipper removed to fix network response hang on Android 13.
  }
}
