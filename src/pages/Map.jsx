import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs, FaEyeSlash, FaEye } from 'react-icons/fa6';
import { drawParkingProhibitionOverlay, updateParkingProhibitionHoles, clearParkingProhibitionOverlay, drawZoneParkingAreas, drawGyeonggiParkingLots } from '../utils/mapUtils';
import { initializeLocationTracking, recenterToMyLocation } from '../utils/locationUtils';
// import seoulData from '../../data/parkinglot_s.json';
import gyeonggiData from '../../data/parkinglot_g.json';
import zonesData from '../../data/zones_2025-06-14.json';

const Map = () => {
    const mapRef = useRef(null);
    const refs = useRef({
        overlayRef: null,
        circleRef: null,
        watchIdRef: null,
        lastLocationRef: null
    });
    const [loaded, setLoaded] = useState(false);
    const [showProhibitionOverlay, setShowProhibitionOverlay] = useState(false);
    const [isLoadingOverlay, setIsLoadingOverlay] = useState(false);

    // 주차구역 내에 있는지 확인하는 함수
    const checkIfInParkingZone = (latitude, longitude) => {
        if (!window.currentZonesData?.zones) {
            return { isInZone: false, zoneName: null };
        }

        for (const zone of window.currentZonesData.zones) {
            if (!zone.coordinates || zone.coordinates.length < 3) continue;

            if (isPointInPolygon(latitude, longitude, zone.coordinates)) {
                return {
                    isInZone: true,
                    zoneName: zone.name || '주차 구역',
                    zoneId: zone.id
                };
            }
        }

        return { isInZone: false, zoneName: null };
    };

    // Point-in-polygon 알고리즘
    const isPointInPolygon = (lat, lng, polygon) => {
        let inside = false;
        let j = polygon.length - 1;

        for (let i = 0; i < polygon.length; i++) {
            const xi = polygon[i][1]; // latitude
            const yi = polygon[i][0]; // longitude
            const xj = polygon[j][1];
            const yj = polygon[j][0];

            if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
            j = i;
        }

        return inside;
    };

    // 좌표를 주소로 변환하고 React Native로 전송하는 함수
    const getAddressFromCoords = (latitude, longitude) => {
        console.log('🚀 getAddressFromCoords called with:', { latitude, longitude });

        if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
            console.log('✅ Kakao services available');
            const geocoder = new window.kakao.maps.services.Geocoder();

            geocoder.coord2Address(longitude, latitude, (result, status) => {
                const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);

                if (status === window.kakao.maps.services.Status.OK) {
                    const address = result[0];
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: address.road_address ? address.road_address.address_name : '',
                        jibunAddress: address.address ? address.address.address_name : '',
                        timestamp: new Date().toISOString(),
                        parkingZone: parkingZoneInfo
                    };

                    console.log('📍 Sending location data:', locationData);

                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location address data:', locationData);
                    }
                } else {
                    const locationData = {
                        latitude,
                        longitude,
                        roadAddress: '',
                        jibunAddress: '',
                        error: '주소 변환 실패',
                        timestamp: new Date().toISOString(),
                        parkingZone: parkingZoneInfo
                    };

                    console.log('📍 Sending location data (address failed):', locationData);

                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: locationData
                        }));
                    } else {
                        console.log('Location data (address failed):', locationData);
                    }
                }
            });
        } else {
            console.log('❌ Kakao services not available');
            const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);
            const locationData = {
                latitude,
                longitude,
                roadAddress: '',
                jibunAddress: '',
                error: 'Geocoder 서비스 로드 실패',
                timestamp: new Date().toISOString(),
                parkingZone: parkingZoneInfo
            };

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'location_address',
                    data: locationData
                }));
            } else {
                console.log('Location data (no geocoder):', locationData);
            }
        }
    };

    // 반납 요청 처리 함수
    const handleReturnRequest = () => {
        console.log('🔄 Return request received');
        if (mapRef.current) {
            const center = mapRef.current.getCenter();
            const latitude = center.getLat();
            const longitude = center.getLng();

            console.log('📍 Current map center:', { latitude, longitude });

            const parkingZoneInfo = checkIfInParkingZone(latitude, longitude);
            console.log('🅿️ Parking zone check result:', parkingZoneInfo);

            const returnData = {
                latitude,
                longitude,
                parkingZone: parkingZoneInfo,
                timestamp: new Date().toISOString()
            };

            console.log('📤 Sending return data:', returnData);

            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'return_request',
                    data: returnData
                }));
            } else {
                console.log('Return request data:', returnData);
            }
        }
    };

    // 지도 중심 위치의 주소 정보 업데이트
    const updateMapCenterLocation = () => {
        if (mapRef.current) {
            const center = mapRef.current.getCenter();
            console.log('🎯 Map center changed:', center.getLat(), center.getLng());

            setTimeout(() => {
                getAddressFromCoords(center.getLat(), center.getLng());
            }, 300);
        }
    };

    // 현재 위치 즉시 전송
    const sendCurrentLocation = () => {
        console.log('📍 Immediate location request');
        if (mapRef.current) {
            const center = mapRef.current.getCenter();
            getAddressFromCoords(center.getLat(), center.getLng());
        }
    };

    useEffect(() => {
        // React Native에서 온 메시지 처리
        const handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('📨 Received message:', message);

                if (message.type === 'request_return') {
                    handleReturnRequest();
                } else if (message.type === 'get_current_location') {
                    sendCurrentLocation();
                }
            } catch (error) {
                console.error('Message parsing error:', error);
            }
        };

        // 메시지 리스너 등록
        if (window.ReactNativeWebView) {
            document.addEventListener('message', handleMessage);
            window.addEventListener('message', handleMessage);
        }

        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude, accuracy } = pos.coords;
                        const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                        const container = document.getElementById('map');
                        const map = new window.kakao.maps.Map(container, { center: latlng, level: 3 });

                        mapRef.current = map;
                        initializeLocationTracking(map, refs, latitude, longitude, accuracy);

                        // zones 데이터로 주차 가능 구역 표시
                        drawZoneParkingAreas(map, zonesData);

                        // 경기도 주차 거치대 데이터 표시
                        drawGyeonggiParkingLots(map, gyeonggiData);

                        setLoaded(true);

                        // 초기 위치 정보 전송 (1초 후)
                        setTimeout(() => {
                            console.log('⏰ Initial location send');
                            getAddressFromCoords(latitude, longitude);
                        }, 1000);

                        // 지도 이동 시 위치 정보 업데이트 및 주차금지구역 구멍 업데이트
                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            console.log('🖱️ dragend event fired');
                            updateMapCenterLocation();

                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
                            console.log('🔍 zoom_changed event fired');
                            updateMapCenterLocation();

                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        // 지도 크기 변경 시에도 구멍 업데이트
                        window.kakao.maps.event.addListener(map, 'tilesloaded', () => {
                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });
                    },
                    (err) => {
                        // 위치 정보를 가져올 수 없는 경우 서울 시청을 기본 위치로 설정
                        const defaultLatlng = new window.kakao.maps.LatLng(37.5666805, 126.9784147);
                        const container = document.getElementById('map');
                        const map = new window.kakao.maps.Map(container, {
                            center: defaultLatlng,
                            level: 3
                        });

                        mapRef.current = map;
                        initializeLocationTracking(map, refs, 37.5666805, 126.9784147, 100);

                        drawZoneParkingAreas(map, zonesData);
                        drawGyeonggiParkingLots(map, gyeonggiData);

                        setLoaded(true);

                        // 기본 위치의 주소 정보 가져오기
                        setTimeout(() => {
                            console.log('⏰ Default location send');
                            getAddressFromCoords(37.5666805, 126.9784147);
                        }, 1000);

                        // 지도 이벤트 리스너 등록
                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            console.log('🖱️ dragend event fired');
                            updateMapCenterLocation();

                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
                            console.log('🔍 zoom_changed event fired');
                            updateMapCenterLocation();

                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        window.kakao.maps.event.addListener(map, 'tilesloaded', () => {
                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        const errorData = {
                            error: true,
                            message: '위치 정보를 가져올 수 없어 기본 위치로 설정되었습니다.',
                            code: err.code,
                            details: err.message
                        };

                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'location_error',
                                data: errorData
                            }));
                        } else {
                            console.warn('위치 정보를 가져올 수 없어 기본 위치로 설정되었습니다.');
                            console.error(err);
                        }
                    },
                    { enableHighAccuracy: true }
                );
            });
        }

        // 클린업
        return () => {
            if (refs.current.watchIdRef) {
                navigator.geolocation.clearWatch(refs.current.watchIdRef);
            }

            if (window.ReactNativeWebView) {
                document.removeEventListener('message', handleMessage);
                window.removeEventListener('message', handleMessage);
            }
        };
    }, [showProhibitionOverlay]);

    // 주차금지구역 오버레이 토글
    const handleToggleProhibitionOverlay = async () => {
        if (!mapRef.current) return;

        setIsLoadingOverlay(true);

        try {
            if (showProhibitionOverlay) {
                // 오버레이 제거
                clearParkingProhibitionOverlay(mapRef.current);
                setShowProhibitionOverlay(false);
            } else {
                // 오버레이 생성 (고정 덮개 + 구멍들)
                await drawParkingProhibitionOverlay(mapRef.current);
                setShowProhibitionOverlay(true);
            }
        } catch (error) {
            console.error('주차금지 오버레이 토글 실패:', error);
            alert('주차금지구역 표시 중 오류가 발생했습니다.');
        } finally {
            setIsLoadingOverlay(false);
        }
    };

    return (
        <Container>
            <MapElement id="map" />

            {loaded && (
                <>
                    <Legend>
                        <LegendTitle>주차 구역 범례</LegendTitle>
                        <LegendItem>
                            <LegendIcon color="#00AA88" />
                            <span>업체 및 법적 허용 구역</span>
                        </LegendItem>
                        <LegendItem>
                            <LegendIcon color="#3498db" />
                            <span>지자체 지정 주차 거치대</span>
                        </LegendItem>
                    </Legend>

                    <ButtonContainer>
                        <LocateButton onClick={() => recenterToMyLocation(mapRef, refs)}>
                            <FaLocationCrosshairs />
                        </LocateButton>

                        <ProhibitionButton
                            onClick={handleToggleProhibitionOverlay}
                            active={showProhibitionOverlay}
                            disabled={isLoadingOverlay}
                        >
                            {isLoadingOverlay ? (
                                <LoadingSpinner />
                            ) : showProhibitionOverlay ? (
                                <FaEyeSlash />
                            ) : (
                                <FaEye />
                            )}
                        </ProhibitionButton>
                    </ButtonContainer>
                </>
            )}

            {showProhibitionOverlay && (
                <StatusIndicator>
                    🚫 주차금지구역 표시 중
                </StatusIndicator>
            )}
        </Container>
    );
};

const Container = styled.div`
    width: 100%;
    height: 100vh;
    position: relative;
`;

const MapElement = styled.div`
    width: 100%;
    height: 100%;
`;

const ButtonContainer = styled.div`
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 10;
`;

const LocateButton = styled.button`
    background: white;
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: pointer;

    &:hover {
        background: #f0f0f0;
    }
`;

const ProhibitionButton = styled.button.withConfig({
    shouldForwardProp: (prop) => !['active'].includes(prop),
})`
    background: ${props => props.active ? '#ff4757' : 'white'};
    border: none;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 20px;
    color: ${props => props.active ? 'white' : '#333'};
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
    opacity: ${props => props.disabled ? 0.7 : 1};

    &:hover:not(:disabled) {
        background: ${props => props.active ? '#ff3742' : '#f0f0f0'};
    }
`;

const LoadingSpinner = styled.div`
    width: 20px;
    height: 20px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;

const Legend = styled.div`
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    z-index: 15;
    min-width: 200px;
`;

const LegendTitle = styled.div`
    font-weight: bold;
    font-size: 14px;
    color: #333;
    margin-bottom: 8px;
    border-bottom: 1px solid #eee;
    padding-bottom: 6px;
`;

const LegendItem = styled.div`
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    font-size: 13px;
    color: #555;

    &:last-child {
        margin-bottom: 0;
    }
`;

const LegendIcon = styled.div`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${props => props.color};
    margin-right: 8px;
    border: 2px solid white;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.3);
`;

const StatusIndicator = styled.div`
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 71, 87, 0.9);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    z-index: 15;
`;

export default Map;