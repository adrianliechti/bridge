#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface BridgeApp : NSObject <NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate>

@property(strong) NSWindow *window;
@property(strong) WKWebView *webView;
@property(strong) NSURL *baseURL;

@end

@implementation BridgeApp

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (BOOL)applicationSupportsSecureRestorableState:(NSApplication *)app {
    return YES;
}

- (BOOL)isAppURL:(NSURL *)url {
    return [url.scheme isEqualToString:self.baseURL.scheme] &&
           [url.host isEqualToString:self.baseURL.host] &&
           [url.port isEqualToNumber:self.baseURL.port];
}

// target="_blank" and window.open land here: open externals in the default
// browser, keep same-origin targets in the app window (never spawn a window).
- (WKWebView *)webView:(WKWebView *)webView
    createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
               forNavigationAction:(WKNavigationAction *)navigationAction
                    windowFeatures:(WKWindowFeatures *)windowFeatures {
    NSURL *url = navigationAction.request.URL;

    if (url == nil) {
        return nil;
    }

    if ([self isAppURL:url]) {
        [webView loadRequest:navigationAction.request];
    } else {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }

    return nil;
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;

    if (url != nil && navigationAction.navigationType == WKNavigationTypeLinkActivated && ![self isAppURL:url]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }

    decisionHandler(WKNavigationActionPolicyAllow);
}

@end

static NSMenuItem *MenuItem(NSString *title, SEL action, NSString *key, NSEventModifierFlags modifiers) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key];

    if (modifiers != 0) {
        item.keyEquivalentModifierMask = modifiers;
    }

    return item;
}

// A minimal but complete menu bar: without an Edit menu, Cmd+C/V/X and
// friends do not reach the WKWebView at all.
static void BuildMenu(WKWebView *webView) {
    NSString *appName = [NSProcessInfo processInfo].processName;

    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:appName];
    [appMenu addItem:MenuItem([@"Hide " stringByAppendingString:appName], @selector(hide:), @"h", 0)];
    [appMenu addItem:MenuItem(@"Hide Others", @selector(hideOtherApplications:), @"h", NSEventModifierFlagCommand | NSEventModifierFlagOption)];
    [appMenu addItem:MenuItem(@"Show All", @selector(unhideAllApplications:), @"", 0)];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItem:MenuItem([@"Quit " stringByAppendingString:appName], @selector(terminate:), @"q", 0)];

    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
    [fileMenu addItem:MenuItem(@"Close Window", @selector(performClose:), @"w", 0)];

    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItem:MenuItem(@"Undo", @selector(undo:), @"z", 0)];
    [editMenu addItem:MenuItem(@"Redo", @selector(redo:), @"Z", 0)];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItem:MenuItem(@"Cut", @selector(cut:), @"x", 0)];
    [editMenu addItem:MenuItem(@"Copy", @selector(copy:), @"c", 0)];
    [editMenu addItem:MenuItem(@"Paste", @selector(paste:), @"v", 0)];
    [editMenu addItem:MenuItem(@"Select All", @selector(selectAll:), @"a", 0)];

    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
    NSMenuItem *reload = MenuItem(@"Reload", @selector(reload:), @"r", 0);
    reload.target = webView;
    [viewMenu addItem:reload];
    [viewMenu addItem:MenuItem(@"Enter Full Screen", @selector(toggleFullScreen:), @"f", NSEventModifierFlagCommand | NSEventModifierFlagControl)];

    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItem:MenuItem(@"Minimize", @selector(performMiniaturize:), @"m", 0)];
    [windowMenu addItem:MenuItem(@"Zoom", @selector(performZoom:), @"", 0)];

    NSMenu *menubar = [NSMenu new];

    for (NSMenu *menu in @[ appMenu, fileMenu, editMenu, viewMenu, windowMenu ]) {
        NSMenuItem *item = [NSMenuItem new];
        item.submenu = menu;
        [menubar addItem:item];
    }

    NSApp.mainMenu = menubar;
    NSApp.windowsMenu = windowMenu;
}

void RunWindow(const char *url, const char *title, int width, int height) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

        NSRect frame = NSMakeRect(0, 0, width, height);
        NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                                  NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable;

        NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                       styleMask:style
                                                         backing:NSBackingStoreBuffered
                                                           defer:NO];
        window.title = [NSString stringWithUTF8String:title];
        window.minSize = NSMakeSize(640, 400);
        window.tabbingMode = NSWindowTabbingModeDisallowed;
        [window center];
        [window setFrameAutosaveName:@"BridgeWindow"];

        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration.preferences setValue:@YES forKey:@"developerExtrasEnabled"];

        WKWebView *webView = [[WKWebView alloc] initWithFrame:frame configuration:configuration];

        if (@available(macOS 13.3, *)) {
            webView.inspectable = YES;
        }

        BridgeApp *delegate = [BridgeApp new];
        delegate.window = window;
        delegate.webView = webView;
        delegate.baseURL = [NSURL URLWithString:[NSString stringWithUTF8String:url]];

        webView.UIDelegate = delegate;
        webView.navigationDelegate = delegate;

        [NSApp setDelegate:delegate];
        BuildMenu(webView);

        window.contentView = webView;
        [webView loadRequest:[NSURLRequest requestWithURL:delegate.baseURL]];

        [window makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];

        [NSApp run];
    }
}
