import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    TextInput
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { stopsApi } from '../api/api';
import { getCurrentLocation, requestLocationPermission, requestCameraPermission } from '../services/gps';
import { Theme } from '../theme/Theme';

const CaptureScreen = ({ route, navigation }: any) => {
    const { surveyor } = route.params;
    const [location, setLocation] = useState<any>(null);
    const [photo, setPhoto] = useState<any>(null);
    const [nearbyStops, setNearbyStops] = useState<any[]>([]);
    const [selectedStops, setSelectedStops] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCapturingLocation, setIsCapturingLocation] = useState(false);
    const [showStopPicker, setShowStopPicker] = useState(false);

    // Manual Entry State
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualStep, setManualStep] = useState(1);
    const [manualName, setManualName] = useState('');
    const [isManual, setIsManual] = useState(false);

    const [towardsStop, setTowardsStop] = useState<any>(null);
    const [towardsSearch, setTowardsSearch] = useState('');
    const [towardsResults, setTowardsResults] = useState<any[]>([]);
    const [isSearchingTowards, setIsSearchingTowards] = useState(false);
    const [showTowardsModal, setShowTowardsModal] = useState(false);

    const startCapture = async () => {
        setIsCapturingLocation(true);
        try {
            const hasPermission = await requestLocationPermission();
            if (!hasPermission) {
                Alert.alert('Permission Denied', 'Location permission is required.');
                return;
            }

            const loc = await getCurrentLocation();
            setLocation(loc);

            // Fetch nearby stops
            const data = await stopsApi.getNearbyStops(loc.latitude, loc.longitude, 500);
            setNearbyStops(data.stops);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to get location.');
        } finally {
            setIsCapturingLocation(false);
        }
    };

    const searchTowardsStops = async (query: string) => {
        setTowardsSearch(query);
        if (query.length < 3) {
            setTowardsResults([]);
            return;
        }

        setIsSearchingTowards(true);
        try {
            const data = await stopsApi.getStops({ search: query, isStage: true });
            setTowardsResults(data.stops.slice(0, 10)); // Limit to top 10
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearchingTowards(false);
        }
    };

    const takePhoto = async () => {
        const hasPermission = await requestCameraPermission();
        if (!hasPermission) {
            Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
            return;
        }

        const result = await launchCamera({
            mediaType: 'photo',
            quality: 0.7,
            saveToPhotos: false,
        });

        if (result.assets && result.assets.length > 0) {
            setPhoto(result.assets[0]);
        }
    };

    const toggleStopSelection = (stop: any) => {
        const isSelected = selectedStops.find(s => s.stop_id === stop.stop_id);
        if (isSelected) {
            setSelectedStops(selectedStops.filter(s => s.stop_id !== stop.stop_id));
        } else {
            setSelectedStops([...selectedStops, stop]);
        }
    };

    const handleSubmit = async () => {
        if (!isManual && selectedStops.length === 0) {
            Alert.alert('Missing Info', 'Please select at least one stop.');
            return;
        }
        if (isManual && (!manualName || !towardsStop)) {
            Alert.alert('Missing Info', 'Please enter stop name and select direction.');
            return;
        }
        if (!location) {
            Alert.alert('Missing Info', 'Please capture location.');
            return;
        }

        setLoading(true);
        try {
            if (isManual) {
                await stopsApi.addManualStop({
                    name: manualName,
                    lat: location.latitude,
                    lon: location.longitude,
                    surveyor: surveyor,
                    photo: photo,
                    towardsStopId: towardsStop.stop_id,
                    towardsStopName: towardsStop.stop_name,
                });
            } else {
                const stopIds = selectedStops.map(s => s.stop_id);
                await stopsApi.submitCorrection(stopIds, {
                    lat: location.latitude,
                    lon: location.longitude,
                    surveyor: surveyor,
                    photo: photo,
                });
            }

            Alert.alert('Success', 'Submission successful!', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error(error);
            Alert.alert('Error', 'Failed to submit data.');
        } finally {
            setLoading(false);
        }
    };

    const resetManual = () => {
        setShowManualModal(false);
        setManualStep(1);
        setManualName('');
        setIsManual(false);
        setTowardsStop(null);
        setTowardsSearch('');
    };

    const confirmManual = () => {
        setIsManual(true);
        setSelectedStops([]);
        setShowManualModal(false);
    };

    useEffect(() => {
        startCapture();
    }, []);

    const renderUpcomingStages = (sequence: any[]) => {
        if (!sequence || sequence.length === 0) return null;
        const currentIndex = sequence.findIndex(s => s.is_current);
        const upcoming = sequence.slice(currentIndex + 1).filter(s => s.is_stage).slice(0, 5);
        if (upcoming.length === 0) return null;

        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.upcomingScroll}>
                <Text style={styles.directionLabel}>Next Stages: </Text>
                {upcoming.map((s, idx) => (
                    <View key={s.stop_id} style={styles.upcomingItem}>
                        <Text style={styles.upcomingText}>{s.stop_name}</Text>
                        {idx < upcoming.length - 1 && <Text style={styles.upcomingArrow}>→</Text>}
                    </View>
                ))}
            </ScrollView>
        );
    };

    const renderSequence = (sequence: any[]) => {
        if (!sequence || sequence.length === 0) return null;

        // Filter: Keep only stage stops OR the current stop being viewed
        const filteredSequence = sequence.filter(s => s.is_stage || s.is_current);

        // Find current stop index in the filtered list
        const currentIndex = filteredSequence.findIndex(s => s.is_current);

        // Limit to 2 previous stops from the filtered list
        const startIndex = Math.max(0, currentIndex - 2);
        const displaySequence = filteredSequence.slice(startIndex);

        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sequenceScroll}>
                {displaySequence.map((item, index) => (
                    <View key={item.stop_id} style={styles.sequenceItem}>
                        <View style={[styles.sequenceNode, item.is_current && styles.activeNode]}>
                            <Text style={[styles.sequenceText, item.is_current && styles.activeText]}>
                                {item.stop_name}
                            </Text>
                        </View>
                        {index < displaySequence.length - 1 && <Text style={styles.arrow}>→</Text>}
                    </View>
                ))}
            </ScrollView>
        );
    };

    return (
        <View style={styles.container}>
            <ScrollView>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Current Location</Text>
                    {isCapturingLocation ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={Theme.colors.primary} />
                            <Text style={styles.loadingText}>Locking GPS...</Text>
                        </View>
                    ) : location ? (
                        <View style={styles.locationCard}>
                            <Text style={styles.locationValue}>Lat: {location.latitude.toFixed(6)}</Text>
                            <Text style={styles.locationValue}>Lon: {location.longitude.toFixed(6)}</Text>
                            <Text style={styles.accuracyText}>Accuracy: ±{Math.round(location.accuracy)}m</Text>
                            <TouchableOpacity onPress={startCapture} style={styles.reCapture}>
                                <Text style={styles.reCaptureText}>Re-capture</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.captureButton} onPress={startCapture}>
                            <Text style={styles.captureButtonText}>Capture GPS</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>2. Select Stops</Text>
                    {isManual ? (
                        <View style={styles.manualSelectedContainer}>
                            <View style={styles.manualBadge}>
                                <Text style={styles.manualBadgeText}>NEW MANUAL ENTRY</Text>
                            </View>
                            <Text style={styles.manualSelectedName}>{manualName}</Text>
                            <Text style={styles.manualSelectedTowards}>Towards: {towardsStop?.stop_name}</Text>
                            <TouchableOpacity onPress={resetManual} style={styles.resetButton}>
                                <Text style={styles.resetButtonText}>Cancel & Choose from List</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity
                                style={styles.pickerTrigger}
                                onPress={() => setShowStopPicker(true)}
                                disabled={nearbyStops.length === 0}
                            >
                                <Text style={selectedStops.length > 0 ? styles.pickerLabelActive : styles.pickerLabel}>
                                    {selectedStops.length > 0
                                        ? `${selectedStops.length} stops selected: ${selectedStops.map(s => s.stop_name).join(', ')}`
                                        : (nearbyStops.length > 0 ? 'Tap to select stops' : 'No nearby stops found')}
                                </Text>
                                <Text style={styles.chevron}>▼</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.manualTrigger}
                                onPress={() => {
                                    setManualStep(1);
                                    setShowManualModal(true);
                                }}
                            >
                                <Text style={styles.manualTriggerText}>No match found? Add manually</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>3. Take Photo</Text>
                    <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                        {photo ? (
                            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                        ) : (
                            <View style={styles.photoPlaceholder}>
                                <Text style={styles.photoPlaceholderText}>Add Photo</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitButton, ((!isManual && selectedStops.length === 0) || !location || loading) && styles.disabledButton]}
                    onPress={handleSubmit}
                    disabled={(!isManual && selectedStops.length === 0) || !location || loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.submitButtonText}>
                            {isManual ? 'Add Manual Stop' : 'Submit Corrections'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Stop Picker Modal */}
            <Modal visible={showStopPicker} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Nearby Stops</Text>
                            <TouchableOpacity onPress={() => setShowStopPicker(false)} style={styles.doneButton}>
                                <Text style={styles.doneButtonText}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={nearbyStops}
                            keyExtractor={(item) => item.stop_id}
                            renderItem={({ item }) => {
                                const isSelected = selectedStops.find(s => s.stop_id === item.stop_id);
                                return (
                                    <View style={[styles.stopItemContainer, isSelected && styles.stopItemActive]}>
                                        <TouchableOpacity
                                            style={styles.stopItemHeader}
                                            onPress={() => toggleStopSelection(item)}
                                        >
                                            <View style={styles.checkboxContainer}>
                                                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                                                </View>
                                                <Text style={styles.stopItemName}>{item.stop_name}</Text>
                                            </View>
                                            <Text style={styles.stopItemDist}>{Math.round(item.distance)}m</Text>
                                        </TouchableOpacity>

                                        {renderSequence(item.sample_sequence)}
                                    </View>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>

            {/* Manual Entry Modal (2-Step) */}
            <Modal visible={showManualModal} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.manualModalContent}>
                        {manualStep === 1 ? (
                            <View>
                                <Text style={styles.manualModalTitle}>Warning</Text>
                                <View style={styles.warningBox}>
                                    <Text style={styles.warningText}>
                                        Manual entries should only be used if the stop is completely missing from the system.
                                        Incorrect manual entries will be rejected.
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.manualPrimaryButton}
                                    onPress={() => setManualStep(2)}
                                >
                                    <Text style={styles.manualPrimaryButtonText}>I understand, proceed</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.manualCancelButton}
                                    onPress={resetManual}
                                >
                                    <Text style={styles.manualCancelButtonText}>Go back to selection</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View>
                                <Text style={styles.manualModalTitle}>Manual Entry Form</Text>

                                <Text style={styles.formLabel}>Stop Name</Text>
                                <TextInput
                                    style={styles.manualInput}
                                    placeholder="Enter Stop Name"
                                    value={manualName}
                                    onChangeText={setManualName}
                                />

                                <Text style={styles.formLabel}>Direction Towards</Text>
                                <TouchableOpacity
                                    style={styles.towardsFieldTrigger}
                                    onPress={() => setShowTowardsModal(true)}
                                >
                                    <Text style={towardsStop ? styles.towardsFieldTextActive : styles.towardsFieldText}>
                                        {towardsStop ? towardsStop.stop_name : 'Select Stage Stop...'}
                                    </Text>
                                    <Text style={styles.chevron}>▼</Text>
                                </TouchableOpacity>

                                {towardsStop && (
                                    <View style={styles.selectedTowardsCard}>
                                        <Text style={styles.selectedTowardsLabel}>Selected Target Direction:</Text>
                                        <Text style={styles.selectedTowardsName}>{towardsStop.stop_name}</Text>
                                        <TouchableOpacity onPress={() => setTowardsStop(null)}>
                                            <Text style={styles.changeText}>Change</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                <View style={styles.formSplitRow}>
                                    <Text style={styles.locationBrief}>GPS: {location?.latitude.toFixed(4)}, {location?.longitude.toFixed(4)}</Text>
                                </View>

                                <TouchableOpacity
                                    style={[styles.manualPrimaryButton, (!manualName || !towardsStop) && styles.disabledButton]}
                                    disabled={!manualName || !towardsStop}
                                    onPress={confirmManual}
                                >
                                    <Text style={styles.manualPrimaryButtonText}>Accept & Continue</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.manualCancelButton}
                                    onPress={() => setManualStep(1)}
                                >
                                    <Text style={styles.manualCancelButtonText}>Previous</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Full-Screen Towards Selection Modal */}
            <Modal visible={showTowardsModal} animationType="slide" transparent={false}>
                <View style={styles.fullScreenModal}>
                    <View style={styles.modalHeaderFixed}>
                        <TouchableOpacity onPress={() => setShowTowardsModal(false)} style={styles.backButton}>
                            <Text style={styles.backButtonText}>← Back</Text>
                        </TouchableOpacity>
                        <Text style={styles.modalHeaderTitle}>Select Direction</Text>
                        <View style={{ width: 60 }} />
                    </View>

                    <View style={styles.searchHeader}>
                        <View style={styles.towardsContainer}>
                            <TextInput
                                style={styles.towardsInput}
                                placeholder="Search official stage stops..."
                                value={towardsSearch}
                                onChangeText={searchTowardsStops}
                                autoFocus={true}
                            />
                            {isSearchingTowards && <ActivityIndicator size="small" style={styles.searchingIndicator} />}
                        </View>
                    </View>

                    <FlatList
                        data={towardsResults}
                        keyExtractor={(item) => item.stop_id}
                        contentContainerStyle={styles.towardsListContent}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.fullResultItem}
                                onPress={() => {
                                    setTowardsStop(item);
                                    setTowardsSearch(item.stop_name);
                                    setShowTowardsModal(false);
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fullResultText}>{item.stop_name}</Text>
                                    {renderUpcomingStages(item.sample_sequence)}
                                </View>
                                <View style={styles.selectArrowContainer}>
                                    <Text style={styles.selectArrow}>→</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={
                            towardsSearch.length >= 3 ? (
                                <View style={styles.emptyResults}>
                                    <Text style={styles.emptyResultsText}>No stage stops found matching "{towardsSearch}"</Text>
                                </View>
                            ) : (
                                <View style={styles.emptyResults}>
                                    <Text style={styles.emptyResultsText}>Type at least 3 characters to search</Text>
                                </View>
                            )
                        }
                    />
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
        padding: Theme.spacing.lg,
    },
    section: {
        marginBottom: Theme.spacing.xl,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Theme.colors.text,
        marginBottom: Theme.spacing.md,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Theme.spacing.md,
    },
    loadingText: {
        marginLeft: Theme.spacing.sm,
        color: Theme.colors.textLight,
    },
    locationCard: {
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.border,
    },
    locationValue: {
        fontSize: 16,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: Theme.colors.text,
    },
    accuracyText: {
        fontSize: 12,
        color: Theme.colors.success,
        marginTop: Theme.spacing.xs,
    },
    reCapture: {
        marginTop: Theme.spacing.sm,
    },
    reCaptureText: {
        color: Theme.colors.primary,
        fontWeight: '600',
    },
    captureButton: {
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.primary,
        alignItems: 'center',
    },
    captureButtonText: {
        color: Theme.colors.primary,
        fontWeight: 'bold',
    },
    pickerTrigger: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Theme.colors.card,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.border,
    },
    pickerLabel: {
        color: Theme.colors.textLight,
        fontSize: 16,
    },
    pickerLabelActive: {
        color: Theme.colors.text,
        fontSize: 16,
        fontWeight: '500',
    },
    chevron: {
        fontSize: 12,
        color: Theme.colors.textLight,
    },
    distanceText: {
        fontSize: 12,
        color: Theme.colors.textLight,
        marginTop: Theme.spacing.xs,
    },
    photoButton: {
        width: '100%',
        height: 180,
        backgroundColor: Theme.colors.card,
        borderRadius: Theme.roundness,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: Theme.colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    photoPlaceholder: {
        alignItems: 'center',
    },
    photoPlaceholderText: {
        color: Theme.colors.textLight,
        fontWeight: 'bold',
    },
    photoPreview: {
        width: '100%',
        height: '100%',
    },
    footer: {
        marginTop: 'auto',
    },
    submitButton: {
        backgroundColor: Theme.colors.success,
        padding: Theme.spacing.lg,
        borderRadius: Theme.roundness,
        alignItems: 'center',
        elevation: 2,
    },
    disabledButton: {
        backgroundColor: Theme.colors.border,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Theme.colors.card,
        borderTopLeftRadius: Theme.roundness * 2,
        borderTopRightRadius: Theme.roundness * 2,
        padding: Theme.spacing.lg,
        maxHeight: '70%',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: Theme.spacing.lg,
        color: Theme.colors.text,
    },
    stopItem: {
        paddingVertical: Theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.border,
    },
    stopItemName: {
        fontSize: 16,
        color: Theme.colors.text,
        fontWeight: '500',
    },
    stopItemDist: {
        fontSize: 12,
        color: Theme.colors.textLight,
    },
    closeButton: {
        marginTop: Theme.spacing.lg,
        padding: Theme.spacing.md,
        alignItems: 'center',
    },
    closeButtonText: {
        color: Theme.colors.secondary,
        fontWeight: 'bold',
    },
    sequenceScroll: {
        marginTop: Theme.spacing.sm,
        flexDirection: 'row',
    },
    sequenceItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sequenceNode: {
        backgroundColor: Theme.colors.border,
        paddingHorizontal: Theme.spacing.sm,
        paddingVertical: 4,
        borderRadius: 4,
    },
    activeNode: {
        backgroundColor: Theme.colors.primary,
    },
    sequenceText: {
        fontSize: 10,
        color: Theme.colors.textLight,
    },
    activeText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    arrow: {
        fontSize: 12,
        color: Theme.colors.textLight,
        marginHorizontal: 4,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Theme.spacing.lg,
    },
    doneButton: {
        backgroundColor: Theme.colors.primary,
        paddingHorizontal: Theme.spacing.md,
        paddingVertical: Theme.spacing.sm,
        borderRadius: Theme.roundness,
    },
    doneButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    stopItemContainer: {
        paddingVertical: Theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.border,
    },
    stopItemActive: {
        backgroundColor: '#F0F4FF',
    },
    stopItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: Theme.colors.primary,
        borderRadius: 4,
        marginRight: Theme.spacing.sm,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxSelected: {
        backgroundColor: Theme.colors.primary,
    },
    checkmark: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    manualTrigger: {
        marginTop: Theme.spacing.md,
        alignItems: 'center',
    },
    manualTriggerText: {
        color: Theme.colors.secondary,
        textDecorationLine: 'underline',
        fontSize: 14,
    },
    manualSelectedContainer: {
        backgroundColor: '#FFFBEB',
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: '#FDE68A',
        alignItems: 'center',
    },
    manualBadge: {
        backgroundColor: '#F59E0B',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 4,
    },
    manualBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    manualSelectedName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Theme.colors.text,
        marginVertical: 4,
    },
    resetButton: {
        marginTop: 8,
    },
    resetButtonText: {
        color: Theme.colors.error || '#EF4444',
        fontSize: 14,
    },
    manualSelectedTowards: {
        fontSize: 14,
        color: Theme.colors.textLight,
        marginTop: 4,
    },
    formLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Theme.colors.text,
        marginBottom: 8,
    },
    towardsFieldTrigger: {
        backgroundColor: Theme.colors.background,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.border,
        padding: Theme.spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Theme.spacing.lg,
    },
    towardsFieldText: {
        fontSize: 16,
        color: Theme.colors.textLight,
    },
    towardsFieldTextActive: {
        fontSize: 16,
        color: Theme.colors.text,
        fontWeight: '500',
    },
    fullScreenModal: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    modalHeaderFixed: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Theme.spacing.md,
        backgroundColor: Theme.colors.card,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.border,
        paddingTop: Platform.OS === 'ios' ? 50 : Theme.spacing.md,
    },
    backButton: {
        padding: Theme.spacing.sm,
    },
    backButtonText: {
        color: Theme.colors.primary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    modalHeaderTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Theme.colors.text,
    },
    towardsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Theme.colors.background,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.border,
    },
    towardsInput: {
        flex: 1,
        padding: Theme.spacing.md,
        fontSize: 16,
        color: Theme.colors.text,
    },
    searchingIndicator: {
        marginRight: Theme.spacing.md,
    },
    searchHeader: {
        padding: Theme.spacing.md,
        backgroundColor: Theme.colors.card,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    towardsListContent: {
        paddingBottom: Theme.spacing.xl,
    },
    fullResultItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Theme.spacing.lg,
        backgroundColor: Theme.colors.card,
        borderBottomWidth: 1,
        borderBottomColor: Theme.colors.border,
    },
    fullResultText: {
        fontSize: 16,
        fontWeight: '600',
        color: Theme.colors.text,
    },
    fullResultSubtext: {
        fontSize: 12,
        color: Theme.colors.textLight,
        marginTop: 2,
    },
    selectArrow: {
        fontSize: 20,
        color: Theme.colors.primary,
        fontWeight: 'bold',
    },
    selectArrowContainer: {
        paddingLeft: Theme.spacing.md,
    },
    upcomingScroll: {
        marginTop: 6,
        flexDirection: 'row',
    },
    directionLabel: {
        fontSize: 10,
        color: Theme.colors.primary,
        fontWeight: '700',
        marginRight: 4,
        alignSelf: 'center',
    },
    upcomingItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    upcomingText: {
        fontSize: 11,
        color: Theme.colors.textLight,
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    upcomingArrow: {
        fontSize: 10,
        color: Theme.colors.border,
        marginHorizontal: 3,
    },
    emptyResults: {
        padding: Theme.spacing.xl,
        alignItems: 'center',
    },
    emptyResultsText: {
        color: Theme.colors.textLight,
        fontSize: 16,
        textAlign: 'center',
    },
    selectedTowardsCard: {
        backgroundColor: '#F0F9FF',
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: '#BAE6FD',
        marginBottom: Theme.spacing.lg,
    },
    selectedTowardsLabel: {
        fontSize: 12,
        color: '#0369A1',
        marginBottom: 4,
    },
    selectedTowardsName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0C4A6E',
    },
    changeText: {
        color: Theme.colors.primary,
        fontSize: 12,
        marginTop: 8,
        fontWeight: '600',
    },
    formSplitRow: {
        marginBottom: Theme.spacing.lg,
    },
    locationBrief: {
        fontSize: 12,
        color: Theme.colors.textLight,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    manualModalContent: {
        backgroundColor: Theme.colors.card,
        borderRadius: Theme.roundness * 2,
        padding: Theme.spacing.xl,
        width: '90%',
        alignSelf: 'center',
        marginBottom: '20%',
    },
    manualModalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: Theme.colors.text,
        marginBottom: Theme.spacing.lg,
        textAlign: 'center',
    },
    warningBox: {
        backgroundColor: '#FEF2F2',
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: '#FCA5A5',
        marginBottom: Theme.spacing.xl,
    },
    warningText: {
        color: '#991B1B',
        lineHeight: 20,
    },
    manualPrimaryButton: {
        backgroundColor: Theme.colors.primary,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        alignItems: 'center',
    },
    manualPrimaryButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    manualCancelButton: {
        marginTop: Theme.spacing.md,
        padding: Theme.spacing.md,
        alignItems: 'center',
    },
    manualCancelButtonText: {
        color: Theme.colors.textLight,
    },
    inputHint: {
        color: Theme.colors.textLight,
        fontSize: 14,
        marginBottom: Theme.spacing.md,
    },
    manualInput: {
        backgroundColor: Theme.colors.background,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        borderWidth: 1,
        borderColor: Theme.colors.border,
        fontSize: 18,
        color: Theme.colors.text,
        marginBottom: Theme.spacing.xl,
    },
    locationVerifyCard: {
        backgroundColor: Theme.colors.background,
        padding: Theme.spacing.md,
        borderRadius: Theme.roundness,
        marginBottom: Theme.spacing.xl,
        borderWidth: 1,
        borderColor: Theme.colors.success,
    },
    verifyLabel: {
        color: Theme.colors.textLight,
        fontSize: 12,
        marginBottom: 4,
    },
    verifyValue: {
        fontSize: 18,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        color: Theme.colors.text,
    },
});

export default CaptureScreen;
