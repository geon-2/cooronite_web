import { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';

const Crawling = () => {
    const mapRef = useRef(null);
    const centerMarkerRef = useRef(null);
    const polygonsRef = useRef([]); // 폴리곤들 추적
    const overlaysRef = useRef([]); // 구역명 오버레이들 추적

    // 좌표 수집 관련 상태
    const [coordinates, setCoordinates] = useState([]);
    const [zones, setZones] = useState([]);
    const [isCollecting, setIsCollecting] = useState(false);
    const [showCollector, setShowCollector] = useState(false);
    const [nextMarkerId, setNextMarkerId] = useState(1); // 마커 ID 카운터

    // 랜덤 색상 생성 함수
    const generateRandomColor = useCallback(() => {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 70 + Math.floor(Math.random() * 20); // 70-90%
        const lightness = 50 + Math.floor(Math.random() * 20);  // 50-70%
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }, []);

    // 사용된 색상과 비슷하지 않은 색상 생성
    const generateUniqueColor = useCallback((existingColors) => {
        let attempts = 0;
        let newColor;
        let isUnique = false;

        while (attempts < 50 && !isUnique) {
            newColor = generateRandomColor();
            attempts++;

            if (existingColors.length === 0) {
                isUnique = true;
                break;
            }

            // HSL에서 Hue 값만 추출해서 비교
            const newHue = parseInt(newColor.match(/\d+/)[0]);
            isUnique = existingColors.every(existingColor => {
                const existingHue = parseInt(existingColor.match(/\d+/)[0]);
                return Math.abs(newHue - existingHue) > 30; // 30도 이상 차이나야 함
            });
        }

        return newColor;
    }, [generateRandomColor]);

    // 임시 마커들 정리 함수
    const clearTempMarkers = useCallback(() => {
        coordinates.forEach(coord => {
            if (coord.marker) {
                coord.marker.setMap(null);
            }
            if (coord.infoWindow) {
                coord.infoWindow.close();
            }
        });
    }, [coordinates]);

    // 마커 위치 업데이트 함수
    const updateMarkerPosition = useCallback(() => {
        if (mapRef.current && centerMarkerRef.current) {
            const center = mapRef.current.getCenter();
            centerMarkerRef.current.setPosition(center);
        }
    }, []);

    // 🎯 중심점 마커 위치를 좌표로 수집
    const collectCenterPoint = useCallback(() => {
        if (!isCollecting) {
            alert('먼저 "수집 시작" 버튼을 클릭하세요.');
            return;
        }

        if (mapRef.current) {
            const center = mapRef.current.getCenter();

            // 수집된 위치에 임시 마커 생성
            const tempMarker = new window.kakao.maps.Marker({
                position: center,
                map: mapRef.current
            });

            // 마커에 번호 표시 (임시로 0, 나중에 업데이트됨)
            const content = `<div style="
                background: #ff4757; 
                color: white; 
                padding: 4px 8px; 
                border-radius: 12px; 
                font-size: 12px; 
                font-weight: bold;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                pointer-events: none;
            ">0</div>`;

            const infoWindow = new window.kakao.maps.InfoWindow({
                content: content,
                position: center,
                removable: false
            });

            infoWindow.open(mapRef.current, tempMarker);

            const newCoord = {
                id: nextMarkerId,
                lat: center.getLat(),
                lng: center.getLng(),
                timestamp: new Date().toLocaleString(),
                marker: tempMarker,
                infoWindow: infoWindow
            };

            setCoordinates(prev => {
                const newCoords = [...prev, newCoord];
                console.log(`중심점 좌표 추가: ${newCoord.lat.toFixed(6)}, ${newCoord.lng.toFixed(6)}`);

                // 모든 정보창의 번호 업데이트
                newCoords.forEach((coord, index) => {
                    const updatedContent = `<div style="
                        background: #ff4757; 
                        color: white; 
                        padding: 4px 8px; 
                        border-radius: 12px; 
                        font-size: 12px; 
                        font-weight: bold;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                        pointer-events: none;
                    ">${index + 1}</div>`;
                    coord.infoWindow.setContent(updatedContent);
                });

                return newCoords;
            });

            setNextMarkerId(prev => prev + 1);
        }
    }, [isCollecting, nextMarkerId]);

    // 수집 시작/중지 토글
    const toggleCollection = useCallback(() => {
        if (isCollecting) {
            // 수집 중지시 확인
            if (coordinates.length > 0) {
                const confirmStop = window.confirm('수집을 중지하면 현재 좌표들이 사라집니다. 계속하시겠습니까?');
                if (!confirmStop) return;
            }
            setCoordinates([]);
            setNextMarkerId(1);
            clearTempMarkers();
        }
        setIsCollecting(!isCollecting);
    }, [isCollecting, coordinates.length, clearTempMarkers]);

    // 특정 좌표 제거
    const removeCoordinate = useCallback((indexToRemove) => {
        console.log('=== 삭제 시작 ===');
        console.log('삭제할 인덱스:', indexToRemove);
        console.log('현재 coordinates 길이:', coordinates.length);

        if (indexToRemove < 0 || indexToRemove >= coordinates.length) {
            console.log('잘못된 인덱스');
            return;
        }

        const coordToRemove = coordinates[indexToRemove];
        console.log('삭제할 좌표:', coordToRemove);

        // 마커와 정보창 제거
        if (coordToRemove.marker) {
            coordToRemove.marker.setMap(null);
            console.log('마커 제거 완료');
        }

        if (coordToRemove.infoWindow) {
            coordToRemove.infoWindow.close();
            console.log('정보창 제거 완료');
        }

        // 좌표 배열에서 제거
        const newCoords = coordinates.filter((_, i) => i !== indexToRemove);

        // 남은 좌표들의 번호 다시 매기기
        newCoords.forEach((coord, index) => {
            if (coord.infoWindow) {
                const content = `<div style="
                    background: #ff4757; 
                    color: white; 
                    padding: 4px 8px; 
                    border-radius: 12px; 
                    font-size: 12px; 
                    font-weight: bold;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    pointer-events: none;
                ">${index + 1}</div>`;
                coord.infoWindow.setContent(content);
            }
        });

        setCoordinates(newCoords);
        console.log(`좌표 개수: ${coordinates.length} → ${newCoords.length}`);
        console.log('=== 삭제 완료 ===');
    }, [coordinates]);

    // 폴리곤 생성 함수
    const createPolygon = useCallback((coordinates, color, zoneId, zoneName, centerPosition) => {
        if (!mapRef.current) return null;

        const path = coordinates.map(coord =>
            new window.kakao.maps.LatLng(coord.lat, coord.lng)
        );

        // 폴리곤 생성
        const polygon = new window.kakao.maps.Polygon({
            path: path,
            strokeWeight: 3,
            strokeColor: color,
            strokeOpacity: 0.8,
            fillColor: color,
            fillOpacity: 0.2
        });

        polygon.setMap(mapRef.current);
        polygon.zoneId = zoneId; // 폴리곤에 구역 ID 저장
        polygonsRef.current.push(polygon);

        // 구역명 표시용 CustomOverlay 생성
        const overlayContent = `
            <div style="
                background: ${color};
                color: white;
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: bold;
                text-align: center;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                border: 2px solid white;
                white-space: nowrap;
                pointer-events: none;
                transform: translate(-50%, -50%);
            ">${zoneName}</div>
        `;

        const overlay = new window.kakao.maps.CustomOverlay({
            content: overlayContent,
            position: new window.kakao.maps.LatLng(centerPosition.lat, centerPosition.lng),
            xAnchor: 0.5,
            yAnchor: 0.5
        });

        overlay.setMap(mapRef.current);
        overlay.zoneId = zoneId; // 오버레이에도 구역 ID 저장
        overlaysRef.current.push(overlay);

        return polygon;
    }, []);

    // 구역 완성
    const finishZone = useCallback(() => {
        if (coordinates.length < 3) {
            alert('최소 3개의 좌표가 필요합니다.');
            return;
        }

        // 폐곡선 만들기
        const closedCoordinates = [...coordinates];
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];

        if (first.lat !== last.lat || first.lng !== last.lng) {
            closedCoordinates.push(first);
        }

        // 중심점 계산
        const avgLat = coordinates.reduce((sum, coord) => sum + coord.lat, 0) / coordinates.length;
        const avgLng = coordinates.reduce((sum, coord) => sum + coord.lng, 0) / coordinates.length;

        // 기존 구역들의 색상 수집
        const existingColors = zones.map(zone => zone.color);

        // 구역 색상 결정 (기존 색상과 구별되는 랜덤 색상)
        const zoneColor = generateUniqueColor(existingColors);
        const zoneId = `zone_${Date.now()}`;
        const zoneName = `구역 ${zones.length + 1}`;

        const newZone = {
            id: zoneId,
            name: zoneName,
            coordinates: closedCoordinates,
            markerPosition: { lat: avgLat, lng: avgLng },
            color: zoneColor
        };

        // 폴리곤과 구역명 오버레이 생성
        createPolygon(closedCoordinates, zoneColor, zoneId, zoneName, { lat: avgLat, lng: avgLng });

        setZones(prev => [...prev, newZone]);
        setCoordinates([]);
        setIsCollecting(false);

        // 임시 마커들 정리
        clearTempMarkers();

        console.log(`새 구역 색상: ${zoneColor}`);
        alert(`구역 "${newZone.name}"이 생성되었습니다!`);
    }, [coordinates, zones, generateUniqueColor, createPolygon, clearTempMarkers]);

    // 구역 삭제
    const deleteZone = useCallback((zoneId) => {
        // 폴리곤 제거
        const polygonIndex = polygonsRef.current.findIndex(polygon => polygon.zoneId === zoneId);
        if (polygonIndex !== -1) {
            polygonsRef.current[polygonIndex].setMap(null);
            polygonsRef.current.splice(polygonIndex, 1);
        }

        // 구역명 오버레이 제거
        const overlayIndex = overlaysRef.current.findIndex(overlay => overlay.zoneId === zoneId);
        if (overlayIndex !== -1) {
            overlaysRef.current[overlayIndex].setMap(null);
            overlaysRef.current.splice(overlayIndex, 1);
        }

        // 구역 목록에서 제거
        setZones(prev => prev.filter(zone => zone.id !== zoneId));
    }, []);

    // 🔥 JSON 파일 생성 및 다운로드
    const generateJsonFile = useCallback(() => {
        if (zones.length === 0) {
            alert('생성할 구역이 없습니다.');
            return;
        }

        const jsonData = {
            zones: zones.map(zone => ({
                id: zone.id,
                name: zone.name,
                coordinates: zone.coordinates.map(coord => [coord.lng, coord.lat]),
                markerPosition: [zone.markerPosition.lng, zone.markerPosition.lat]
            }))
        };

        // JSON 파일 생성 및 다운로드
        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `zones_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('생성된 JSON 데이터:', jsonData);
        alert(`${zones.length}개 구역이 포함된 JSON 파일이 다운로드되었습니다!`);
    }, [zones]);

    useEffect(() => {
        const checkKakaoMaps = () => {
            if (window.kakao && window.kakao.maps) {
                window.kakao.maps.load(() => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const { latitude, longitude } = pos.coords;
                            const latlng = new window.kakao.maps.LatLng(latitude, longitude);
                            const container = document.getElementById('map');
                            const map = new window.kakao.maps.Map(container, {
                                center: latlng,
                                level: 3
                            });

                            mapRef.current = map;

                            // 중심점 마커 생성 (기본적으로 표시)
                            const centerMarker = new window.kakao.maps.Marker({
                                position: latlng,
                                map: map
                            });

                            centerMarkerRef.current = centerMarker;

                            console.log('🗺️ 지도 준비 완료!');

                            // 이벤트 리스너들
                            window.kakao.maps.event.addListener(map, 'dragend', updateMarkerPosition);
                            window.kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerPosition);
                        },
                        (err) => {
                            console.error(err);

                            const defaultLatlng = new window.kakao.maps.LatLng(37.5666805, 126.9784147);
                            const container = document.getElementById('map');
                            const map = new window.kakao.maps.Map(container, {
                                center: defaultLatlng,
                                level: 3
                            });

                            mapRef.current = map;

                            // 중심점 마커 생성 (기본적으로 표시)
                            const centerMarker = new window.kakao.maps.Marker({
                                position: defaultLatlng,
                                map: map
                            });

                            centerMarkerRef.current = centerMarker;

                            window.kakao.maps.event.addListener(map, 'dragend', updateMarkerPosition);
                            window.kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerPosition);

                            console.log('🗺️ 기본 위치 지도 준비 완료!');
                        },
                        { enableHighAccuracy: true }
                    );
                });
            } else {
                setTimeout(checkKakaoMaps, 500);
            }
        };

        checkKakaoMaps();
    }, [updateMarkerPosition]);

    return (
        <Container>
            <MapElement id="map" />
            {/* 중심점 십자가 */}
            <Crosshair>
                <HorizontalLine />
                <VerticalLine />
                <CenterDot />
            </Crosshair>

            {/* 좌표 수집 컨트롤러 */}
            <CollectorToggle onClick={() => setShowCollector(!showCollector)}>
                {showCollector ? '📍 숨기기' : '📍 좌표 수집'}
            </CollectorToggle>

            {showCollector && (
                <CollectorPanel>
                    <PanelHeader>
                        <h3>구역 수집 도구</h3>
                        <CloseButton onClick={() => setShowCollector(false)}>✕</CloseButton>
                    </PanelHeader>

                    {/* 수집 상태 표시 */}
                    {isCollecting && (
                        <CollectingStatus>
                            🎯 수집 중... 지도를 이동하고 "좌표 추가" 버튼을 클릭하세요!
                        </CollectingStatus>
                    )}

                    {/* 컨트롤 버튼들 */}
                    <ControlButtons>
                        <CollectButton
                            $active={isCollecting}
                            onClick={toggleCollection}
                        >
                            {isCollecting ? '🛑 수집 중지' : '📍 수집 시작'}
                        </CollectButton>

                        {isCollecting && (
                            <AddPointButton onClick={collectCenterPoint}>
                                ➕ 좌표 추가
                            </AddPointButton>
                        )}
                    </ControlButtons>

                    <ControlButtons>
                        <FinishButton
                            onClick={finishZone}
                            disabled={coordinates.length < 3}
                        >
                            ✅ 구역 완성 ({coordinates.length})
                        </FinishButton>
                    </ControlButtons>

                    {/* 현재 좌표 목록 */}
                    {coordinates.length > 0 && (
                        <CoordinateList>
                            <h4>현재 수집된 좌표</h4>
                            <CoordinateItems>
                                {coordinates.map((coord, index) => (
                                    <CoordinateItem key={index}>
                                        <span>{index + 1}. {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}</span>
                                        <button onClick={() => removeCoordinate(index)}>
                                            ✕
                                        </button>
                                    </CoordinateItem>
                                ))}
                            </CoordinateItems>
                        </CoordinateList>
                    )}

                    {/* 수집된 구역 목록 */}
                    {zones.length > 0 && (
                        <ZoneList>
                            <ZoneListHeader>
                                <h4>수집된 구역 ({zones.length}개)</h4>
                                <ExportButtons>
                                    <GenerateButton onClick={generateJsonFile}>
                                        📥 JSON 다운로드
                                    </GenerateButton>
                                </ExportButtons>
                            </ZoneListHeader>

                            <ZoneItems>
                                {zones.map((zone) => (
                                    <ZoneItem key={zone.id}>
                                        <ZoneHeader>
                                            <div>
                                                <ColorIndicator $color={zone.color} />
                                                <strong>{zone.name}</strong>
                                            </div>
                                            <button onClick={() => deleteZone(zone.id)}>
                                                🗑️
                                            </button>
                                        </ZoneHeader>
                                        <small>{zone.coordinates.length}개 좌표</small>
                                    </ZoneItem>
                                ))}
                            </ZoneItems>
                        </ZoneList>
                    )}

                    {/* 사용법 */}
                    <UsageInfo>
                        <h4>📋 사용법</h4>
                        <ol>
                            <li>"수집 시작" 클릭</li>
                            <li>지도를 이동하여 중심점을 맞추고 "좌표 추가" 클릭</li>
                            <li>구역 경계를 따라 시계방향으로 반복하세요</li>
                            <li>최소 3개 이상 수집 후 "구역 완성" 클릭</li>
                            <li>"JSON 다운로드"로 데이터 파일 저장</li>
                        </ol>
                    </UsageInfo>
                </CollectorPanel>
            )}
        </Container>
    );
};

// 스타일 컴포넌트들
const Container = styled.div`
    width: 100%;
    height: 100vh;
    position: relative;
`;

const MapElement = styled.div`
    width: 100%;
    height: 100%;
`;

const Crosshair = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
    pointer-events: none;
`;

const HorizontalLine = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 2px;
    background-color: #ff4757;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
    pointer-events: none;
`;

const VerticalLine = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 20px;
    background-color: #ff4757;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
    pointer-events: none;
`;

const CenterDot = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background-color: #ff4757;
    border-radius: 50%;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 0 4px rgba(255, 71, 87, 0.3);
    pointer-events: none;
`;

const CollectorToggle = styled.button`
    position: absolute;
    top: 20px;
    right: 20px;
    background: #4A90E2;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 100;

    &:hover {
        background: #357ABD;
    }
`;

const CollectorPanel = styled.div`
    position: absolute;
    top: 20px;
    left: 20px;
    width: 380px;
    max-height: calc(100vh - 40px);
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 15;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const PanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;

    h3 {
        margin: 0;
        font-size: 16px;
        color: #333;
    }
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #666;

    &:hover {
        color: #333;
    }
`;

const ControlButtons = styled.div`
    padding: 0 20px 15px;
    display: flex;
    gap: 10px;
`;

const CollectButton = styled.button`
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    background: ${props => props.$active ? '#FF6B6B' : '#4CAF50'};
    color: white;
    transition: all 0.2s;

    &:hover {
        opacity: 0.9;
        transform: scale(1.02);
    }
`;

const AddPointButton = styled.button`
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    background: #FF9800;
    color: white;
    transition: all 0.2s;

    &:hover {
        background: #F57C00;
        transform: scale(1.02);
    }
`;

const CollectingStatus = styled.div`
    padding: 10px 20px;
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 6px;
    color: #856404;
    font-size: 13px;
    font-weight: bold;
    text-align: center;
    margin: 0 20px 15px;
    animation: pulse 2s infinite;

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }
`;

const FinishButton = styled.button`
    flex: 1;
    padding: 10px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    background: ${props => props.disabled ? '#ccc' : '#9C27B0'};
    color: white;

    &:disabled {
        cursor: not-allowed;
    }

    &:hover:not(:disabled) {
        opacity: 0.9;
    }
`;

const CoordinateList = styled.div`
    padding: 15px 20px;
    border-top: 1px solid #e9ecef;

    h4 {
        margin: 0 0 10px 0;
        font-size: 14px;
        color: #333;
    }
`;

const CoordinateItems = styled.div`
    max-height: 150px;
    overflow-y: auto;
`;

const CoordinateItem = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 0;
    font-size: 12px;

    button {
        background: none;
        border: none;
        color: #ff4757;
        cursor: pointer;
        padding: 2px 5px;

        &:hover {
            background: #ffebee;
            border-radius: 3px;
        }
    }
`;

const ZoneList = styled.div`
    padding: 15px 20px;
    border-top: 1px solid #e9ecef;
    flex: 1;
    overflow-y: auto;
`;

const ZoneListHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;

    h4 {
        margin: 0;
        font-size: 14px;
        color: #333;
    }
`;

const ExportButtons = styled.div`
    display: flex;
    gap: 5px;
`;

const GenerateButton = styled.button`
    background: #FF9800;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;

    &:hover {
        background: #F57C00;
    }
`;

const ZoneItems = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ZoneItem = styled.div`
    background: #f8f9fa;
    padding: 10px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;

    small {
        color: #666;
        font-size: 11px;
    }
`;

const ZoneHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;

    div {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    button {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 12px;
        padding: 4px;
        border-radius: 4px;

        &:hover {
            background: #fff;
        }
    }
`;

const ColorIndicator = styled.div`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${props => props.$color};
    border: 2px solid white;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
`;

const UsageInfo = styled.div`
    padding: 15px 20px;
    background: #f8f9fa;
    border-top: 1px solid #e9ecef;

    h4 {
        margin: 0 0 8px 0;
        font-size: 12px;
        color: #666;
    }

    ol {
        margin: 0;
        padding-left: 16px;
        font-size: 11px;
        color: #666;
        line-height: 1.4;
    }

    li {
        margin-bottom: 2px;
    }
`;

export default Crawling;