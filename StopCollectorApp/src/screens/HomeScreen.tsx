import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stopsApi } from '../api/api';
import { Theme } from '../theme/Theme';

const SURVEYOR_NAME_KEY = '@surveyor_name';

const HomeScreen = ({ navigation }: any) => {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [surveyor, setSurveyor] = useState('');
    const [isNameSaved, setIsNameSaved] = useState(false);
    const [isNameLoading, setIsNameLoading] = useState(true);

    const loadName = async () => {
        setIsNameLoading(true);
        try {
            const savedName = await AsyncStorage.getItem(SURVEYOR_NAME_KEY);
            if (savedName) {
                setSurveyor(savedName);
                setIsNameSaved(true);
            }
        } catch (e) {
            console.error('Failed to load name', e);
        } finally {
            setIsNameLoading(false);
        }
    };

    const saveName = async () => {
        if (!surveyor.trim()) return;
        try {
            await AsyncStorage.setItem(SURVEYOR_NAME_KEY, surveyor.trim());
            setIsNameSaved(true);
        } catch (e) {
            console.error('Failed to save name', e);
        }
    };

    const handleStartSurveying = () => {
        if (!isNameSaved) {
            saveName();
        }
        navigation.navigate('Capture', { surveyor });
    };

    const fetchStats = async () => {
        setLoading(true);
        try {
            const data = await stopsApi.getStats();
            setStats(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        loadName();
    }, []);

    if (isNameLoading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color={Theme.colors.primary} size="large" />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchStats} />}
        >
            <View style={styles.header}>
                <Text style={styles.title}>Chennai Bus Stops</Text>
                <Text style={styles.subtitle}>GTFS Correction Tool</Text>
            </View>

            {isNameSaved ? (
                <View style={styles.welcomeCard}>
                    <View>
                        <Text style={styles.welcomeLabel}>Surveyor</Text>
                        <Text style={styles.welcomeName}>{surveyor}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setIsNameSaved(false)}>
                        <Text style={styles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.surveyorSection}>
                    <Text style={styles.inputLabel}>Ready to start? Enter your name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Surveyor Name"
                        value={surveyor}
                        onChangeText={setSurveyor}
                    />
                </View>
            )}

            <View style={styles.statsContainer}>
                <View style={styles.statsHeader}>
                    <Text style={styles.sectionTitle}>Network Progress</Text>
                </View>

                <View style={styles.statsRow}>
                    <View style={[styles.statCardSmall, { borderLeftColor: Theme.colors.secondary }]}>
                        <Text style={styles.statLabelSmall}>Pending</Text>
                        <Text style={styles.statValueSmall}>{stats?.needs_correction || '-'}</Text>
                    </View>
                    <View style={[styles.statCardSmall, { borderLeftColor: Theme.colors.success }]}>
                        <Text style={styles.statLabelSmall}>Corrected</Text>
                        <Text style={styles.statValueSmall}>{stats?.corrected || '-'}</Text>
                    </View>
                </View>

                <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${stats?.progress_percentage || 0}%` }
                            ]}
                        />
                    </View>
                    <Text style={styles.progressText}>{stats?.progress_percentage || 0}% Complete</Text>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.mainButton, (!surveyor || !surveyor.trim()) && styles.disabledButton]}
                onPress={handleStartSurveying}
                disabled={!surveyor || !surveyor.trim()}
            >
                <Text style={styles.mainButtonText}>
                    {isNameSaved ? 'Go to Capture' : 'Save & Start Surveying'}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => navigation.navigate('StopList')}
            >
                <Text style={styles.secondaryButtonText}>Browse Stop List</Text>
            </TouchableOpacity>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
        padding: Theme.spacing.lg,
    },
    header: {
        marginBottom: Theme.spacing.xl,
        marginTop: Theme.spacing.xl,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    subtitle: {
        fontSize: 16,
        color: Theme.colors.textLight,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    welcomeCard: {
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.lg,
        borderRadius: Theme.roundness,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Theme.spacing.xl,
        borderWidth: 1,
        borderColor: Theme.colors.border,
    },
    welcomeLabel: {
        fontSize: 12,
        color: Theme.colors.textLight,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    welcomeName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    changeBtnText: {
        color: Theme.colors.primary,
        fontWeight: '600',
    },
    statsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Theme.spacing.md,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    statsContainer: {
        marginBottom: Theme.spacing.xl,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statCardSmall: {
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderLeftWidth: 4,
        width: '48%',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    statLabelSmall: {
        fontSize: 12,
        color: Theme.colors.textLight,
        textTransform: 'uppercase',
    },
    statValueSmall: {
        fontSize: 24,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    progressContainer: {
        marginTop: Theme.spacing.lg,
    },
    progressBar: {
        height: 8,
        backgroundColor: Theme.colors.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: Theme.colors.success,
    },
    progressText: {
        fontSize: 12,
        color: Theme.colors.textLight,
        marginTop: Theme.spacing.xs,
        textAlign: 'right',
    },
    surveyorSection: {
        marginBottom: Theme.spacing.xl,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Theme.colors.text,
        marginBottom: Theme.spacing.sm,
    },
    input: {
        backgroundColor: Theme.colors.card,
        borderWidth: 1,
        borderColor: Theme.colors.border,
        borderRadius: Theme.roundness,
        padding: Theme.spacing.md,
        fontSize: 16,
        color: Theme.colors.text,
    },
    mainButton: {
        backgroundColor: Theme.colors.primary,
        padding: Theme.spacing.lg,
        borderRadius: Theme.roundness,
        alignItems: 'center',
        marginBottom: Theme.spacing.md,
        elevation: 3,
    },
    disabledButton: {
        backgroundColor: Theme.colors.border,
    },
    mainButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    secondaryButton: {
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Theme.colors.primary,
    },
    secondaryButtonText: {
        color: Theme.colors.primary,
        fontSize: 16,
        fontWeight: '600',
    },
});

export default HomeScreen;
