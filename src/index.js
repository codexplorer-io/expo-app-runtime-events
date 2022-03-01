import { useRef, useCallback, useEffect } from 'react';
import { useAppInfo } from '@codexporer.io/expo-app-info';
import { createStore, createHook } from 'react-sweet-state';
import * as SecureStore from 'expo-secure-store';
import isNil from 'lodash/isNil';
import forEach from 'lodash/forEach';

const getLastAppVersion = async appVersion => {
    const key = 'codexporer.io-expo_app_runtime_events-last_app_version';
    let lastAppVersion;
    try {
        lastAppVersion = await SecureStore.getItemAsync(key);
    } catch {
        lastAppVersion = null;
    }

    if (lastAppVersion !== appVersion) {
        await SecureStore.setItemAsync(key, appVersion, {
            keychainAccessible: SecureStore.ALWAYS
        });
    }

    return lastAppVersion;
};

// We assume if app is installed more than 2 days ago, it is an update
// as user had very likely already run the application once
const INSTALLATION_DELTA_MILLISECONDS = 2 * 24 * 60 * 60 * 1000;

const Store = createStore({
    initialState: {
        isFirstRunAfterInstall: undefined,
        isFirstRunAfterUpdate: undefined,
        previousAppVersion: undefined
    },
    actions: {
        initializeRuntimeInfo: ({
            appVersion,
            installationTime
        }) => async ({ setState }) => {
            const previousAppVersion = await getLastAppVersion(appVersion);
            const timeNow = new Date();
            const installedBeforeMilliseconds = timeNow - installationTime;

            let isFirstRunAfterInstall = false;
            let isFirstRunAfterUpdate = false;
            if (isNil(previousAppVersion)) {
                isFirstRunAfterInstall =
                    installedBeforeMilliseconds < INSTALLATION_DELTA_MILLISECONDS;
                isFirstRunAfterUpdate = !isFirstRunAfterInstall;
            } else if (previousAppVersion !== appVersion) {
                isFirstRunAfterUpdate = true;
            }

            setState({
                isFirstRunAfterInstall,
                isFirstRunAfterUpdate,
                previousAppVersion
            });
        }
    },
    name: 'AppRuntimeInfo'
});

const useStore = createHook(Store);

export const useAppRuntimeEvents = ({
    onAfterInstall = [],
    onAfterUpdate = []
}) => {
    const [{
        isFirstRunAfterInstall,
        isFirstRunAfterUpdate,
        previousAppVersion
    }, {
        initializeRuntimeInfo: initializeRuntimeInfoAction
    }] = useStore();
    const [{ appVersion, installationTime }] = useAppInfo();

    const initializeDependenciesRef = useRef();
    initializeDependenciesRef.current = {
        initializeRuntimeInfoAction,
        appVersion,
        installationTime
    };

    const initializeRuntimeInfo = useCallback(() => {
        const {
            initializeRuntimeInfoAction,
            appVersion,
            installationTime
        } = initializeDependenciesRef.current;
        initializeRuntimeInfoAction({
            appVersion,
            installationTime
        });
    }, []);

    const runEventsDependenciesRef = useRef();
    runEventsDependenciesRef.current = {
        onAfterInstall,
        onAfterUpdate,
        appVersion,
        previousAppVersion
    };

    useEffect(() => {
        const {
            onAfterInstall,
            onAfterUpdate,
            appVersion,
            previousAppVersion
        } = runEventsDependenciesRef.current;

        if (isFirstRunAfterInstall) {
            forEach(onAfterInstall, f => {
                f({ appVersion, previousAppVersion });
            });
        }

        if (isFirstRunAfterUpdate) {
            forEach(onAfterUpdate, f => {
                f({ appVersion, previousAppVersion });
            });
        }
    }, [
        isFirstRunAfterInstall,
        isFirstRunAfterUpdate
    ]);

    return {
        initializeRuntimeInfo
    };
};
