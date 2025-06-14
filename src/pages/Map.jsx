import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { FaLocationCrosshairs, FaEyeSlash, FaEye } from 'react-icons/fa6';
import { drawParkingAllowedZone, drawPredefinedParkingLots, drawParkingProhibitionOverlay, updateParkingProhibitionHoles, clearParkingProhibitionOverlay, drawZoneParkingAreas } from '../utils/mapUtils';
import { initializeLocationTracking, recenterToMyLocation } from '../utils/locationUtils';
// import seoulData from '../../data/parkinglot_s.json';
// import gyeonggiData from '../../data/parkinglot_g.json';
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

    useEffect(() => {
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

                        // 기존 API 호출 주차 구역 표시 비활성화
                        // drawParkingAllowedZone(map);

                        // 기존 주차장 데이터 표시 비활성화
                        // drawPredefinedParkingLots(map, seoulData, gyeonggiData);

                        // zones 데이터로 주차 가능 구역 표시
                        drawZoneParkingAreas(map, zonesData);

                        setLoaded(true);

                        window.kakao.maps.event.addListener(map, 'dragend', () => {
                            // drawParkingAllowedZone(map); // 비활성화
                            // 주차금지 오버레이가 활성화되어 있으면 구멍만 업데이트
                            if (showProhibitionOverlay) {
                                updateParkingProhibitionHoles(map);
                            }
                        });

                        window.kakao.maps.event.addListener(map, 'zoom_changed', () => {
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
                        alert('위치 정보를 가져올 수 없습니다.');
                        console.error(err);
                    },
                    { enableHighAccuracy: true }
                );
            });
        }

        return () => {
            if (refs.current.watchIdRef) {
                navigator.geolocation.clearWatch(refs.current.watchIdRef);
            }
        };
    }, []);

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