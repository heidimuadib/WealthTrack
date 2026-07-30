import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import Snackbar from './Snackbar';

const FeedbackContext = createContext(null);

export const useFeedback = () => {
    const value = useContext(FeedbackContext);
    if (!value) {
        throw new Error('useFeedback must be used inside <FeedbackProvider>');
    }
    return value;
};

const EMPTY_SNACK = { visible: false, message: '', actionLabel: null };

export const FeedbackProvider = ({ children }) => {
    const [dialog, setDialog] = useState({ visible: false });
    const [snack, setSnack] = useState(EMPTY_SNACK);

    // Resolver for the promise handed back by confirm()/alert().
    const resolverRef = useRef(null);
    // The pending snackbar's timer and its "not undone" callback.
    const timerRef = useRef(null);
    const timeoutActionRef = useRef(null);
    const undoActionRef = useRef(null);

    const settle = useCallback((result) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setDialog((prev) => ({ ...prev, visible: false }));
        if (resolve) {
            resolve(result);
        }
    }, []);

    const confirm = useCallback((options = {}) =>
        new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialog({ visible: true, showCancel: true, ...options });
        }), []);

    const alert = useCallback((options = {}) =>
        new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialog({
                visible: true,
                showCancel: false,
                confirmLabel: 'OK',
                ...options,
            });
        }), []);

    // Runs the pending onTimeout immediately — used when a new snackbar
    // replaces an unexpired one, so a deferred delete is never silently lost.
    const flushPending = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const pending = timeoutActionRef.current;
        timeoutActionRef.current = null;
        undoActionRef.current = null;
        if (pending) {
            pending();
        }
    }, []);

    const notify = useCallback(
        ({ message, actionLabel = null, onAction = null, onTimeout = null, duration = 5000 }) => {
            flushPending();

            timeoutActionRef.current = onTimeout;
            undoActionRef.current = onAction;
            setSnack({ visible: true, message, actionLabel });

            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                const pending = timeoutActionRef.current;
                timeoutActionRef.current = null;
                undoActionRef.current = null;
                setSnack(EMPTY_SNACK);
                if (pending) {
                    pending();
                }
            }, duration);
        },
        [flushPending]
    );

    const handleSnackAction = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        const undo = undoActionRef.current;
        // Cancel the deferred work — this is the whole point of undo.
        timeoutActionRef.current = null;
        undoActionRef.current = null;
        setSnack(EMPTY_SNACK);
        if (undo) {
            undo();
        }
    }, []);

    // If the app tears down mid-window, commit rather than drop the action.
    useEffect(() => () => flushPending(), [flushPending]);

    const value = useMemo(() => ({ confirm, alert, notify }), [confirm, alert, notify]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}

            <ConfirmDialog
                {...dialog}
                onConfirm={() => settle(true)}
                onCancel={() => settle(false)}
            />

            <Snackbar
                visible={snack.visible}
                message={snack.message}
                actionLabel={snack.actionLabel}
                onAction={handleSnackAction}
            />
        </FeedbackContext.Provider>
    );
};

export default FeedbackProvider;
