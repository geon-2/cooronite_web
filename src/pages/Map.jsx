import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs, FaEyeSlash, FaEye } from 'react-icons/fa6';
import { drawParkingProhibitionOverlay, updateParkingProhibitionHoles, clearParkingProhibitionOverlay, drawZoneParkingAreas, drawGyeonggiParkingLots } from '../utils/mapUtils';
import { initializeLocationTracking, recenterToMyLocation } from '../utils/locationUtils';
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

    // 내 위치, 내 위치 기준 zone, 내 위치 기준 주소
    const [myLocation, setMyLocation] = useState(null);
    const [myZone, setMyZone] = useState({ isInZone: false, zoneName: null, zoneId: null });
    const [myAddress, setMyAddress] = useState({
        roadAddress: '',
        jibunAddress: '',
        timestamp: ''
    });

    // 지도 로딩 및 오버레이 상태
    const [loaded, setLoaded] = useState(false);
    const [showProhibitionOverlay, setShowProhibitionOverlay] = useState(false);
    const [isLoadingOverlay, setIsLoadingOverlay] = useState(false);

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

    // zone 판정 함수
    const checkIfInParkingZone = (latitude, longitude) => {
        if (!window.currentZonesData?.zones) return { isInZone: false, zoneName: null, zoneId: null };
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
        return { isInZone: false, zoneName: null, zoneId: null };
    };

    // 내 위치 기준 주소 변환 → myAddress, ReactNative로도 전송
    const updateMyAddressAndZone = (latitude, longitude) => {
        if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
            const geocoder = new window.kakao.maps.services.Geocoder();
            geocoder.coord2Address(longitude, latitude, (result, status) => {
                const zone = checkIfInParkingZone(latitude, longitude);
                if (status === window.kakao.maps.services.Status.OK) {
                    const address = result[0];
                    const addr = {
                        roadAddress: address.road_address ? address.road_address.address_name : '',
                        jibunAddress: address.address ? address.address.address_name : '',
                        timestamp: new Date().toISOString()
                    };
                    setMyAddress(addr);
                    setMyZone(zone);

                    // React Native로 위치+zone+주소 전송
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'location_address',
                            data: { latitude, longitude, ...addr, parkingZone: zone }
                        }));
                    }
                } else {
                    setMyAddress({
                        roadAddress: '',
                        jibunAddress: '',
                        timestamp: new Date().toISOString()
                    });
                    setMyZone(zone);
                }
            });
        }
    };

    // 지도/이벤트 최초 한 번만 세팅
    useEffect(() => {
        let watchId = null;
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
                // 1. 최초 위치로 지도 생성
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        const { latitude, longitude, accuracy } = pos.coords;
                        const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                        const container = document.getElementById('map');
                        const map = new window.kakao.maps.Map(container, { center: latlng, level: 3 });
                        mapRef.current = map;
                        initializeLocationTracking(map, refs, latitude, longitude, accuracy);
                        drawZoneParkingAreas(map, zonesData);
                        drawGyeonggiParkingLots(map, gyeonggiData);
                        setLoaded(true);

                        setMyLocation({ latitude, longitude });
                        updateMyAddressAndZone(latitude, longitude);

                        // 지도 중심 이동/확대 축소 이벤트는 오버레이 구멍 갱신용
                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            if (showProhibitionOverlay) updateParkingProhibitionHoles(map);
                        });
                        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
                            if (showProhibitionOverlay) updateParkingProhibitionHoles(map);
                        });
                        window.kakao.maps.event.addListener(map, 'tilesloaded', () => {
                            if (showProhibitionOverlay) updateParkingProhibitionHoles(map);
                        });
                    },
                    (err) => {
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
                        setMyLocation({ latitude: 37.5666805, longitude: 126.9784147 });
                        updateMyAddressAndZone(37.5666805, 126.9784147);
                    },
                    { enableHighAccuracy: true }
                );

                // 2. 실시간 위치 추적 (이 부분이 실시간 반영의 핵심)
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        const { latitude, longitude } = pos.coords;
                        setMyLocation({ latitude, longitude });
                        updateMyAddressAndZone(latitude, longitude);
                    },
                    (err) => {
                        // 위치 추적 실패시 필요하면 알림 등 처리
                    },
                    { enableHighAccuracy: true, distanceFilter: 3 }
                );
            });
        }
        // 클린업
        return () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
            }
        };
    }, []);

    // RN에서 메시지 받는 함수 (return 등)
    useEffect(() => {
        const handleMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'request_return') handleReturnRequest();
                else if (message.type === 'get_current_location') {
                    if (myLocation) updateMyAddressAndZone(myLocation.latitude, myLocation.longitude);
                }
            } catch (error) {
                console.error('Message parsing error:', error);
            }
        };
        if (window.ReactNativeWebView) {
            document.addEventListener('message', handleMessage);
            window.addEventListener('message', handleMessage);
        }
        return () => {
            if (window.ReactNativeWebView) {
                document.removeEventListener('message', handleMessage);
                window.removeEventListener('message', handleMessage);
            }
        };
    }, [myLocation]);

    // 반납 요청: 내 위치 기준!
    const handleReturnRequest = () => {
        if (!myLocation) return;
        const { latitude, longitude } = myLocation;
        const zone = checkIfInParkingZone(latitude, longitude);
        const returnData = {
            latitude,
            longitude,
            parkingZone: zone,
            timestamp: new Date().toISOString()
        };
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'return_request',
                data: returnData
            }));
        }
    };

    // 오버레이 토글
    const handleToggleProhibitionOverlay = async () => {
        if (!mapRef.current) return;
        setIsLoadingOverlay(true);
        try {
            if (showProhibitionOverlay) {
                clearParkingProhibitionOverlay(mapRef.current);
                setShowProhibitionOverlay(false);
            } else {
                await drawParkingProhibitionOverlay(mapRef.current);
                setShowProhibitionOverlay(true);
            }
        } catch (error) {
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

            {/* 내 위치 정보 UI (원한다면 보여줄 때) */}
            {myLocation && (
                <MyLocationIndicator>
                    <b>내 위치:</b> {myLocation.latitude.toFixed(5)}, {myLocation.longitude.toFixed(5)}<br/>
                    {myZone.isInZone ? (
                        <span>🅿️ {myZone.zoneName}</span>
                    ) : (
                        <span>❌ 주차구역 아님</span>
                    )}
                    <br />
                    {myAddress.roadAddress && <span>{myAddress.roadAddress}</span>}
                </MyLocationIndicator>
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
    &:hover { background: #f0f0f0; }
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
const MyLocationIndicator = styled.div`
    position: absolute;
    bottom: 80px;
    left: 20px;
    background: rgba(44, 62, 80, 0.92);
    color: #fff;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 16;
    min-width: 180px;
`;

export default Map;
