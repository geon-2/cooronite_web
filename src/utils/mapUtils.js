// 전역 변수로 관리
let currentActiveRoadview = null; // 현재 활성화된 로드뷰

/**
 * 현재 활성화된 로드뷰 숨기기
 */
const hideActiveRoadview = () => {
    if (currentActiveRoadview && currentActiveRoadview.container) {
        currentActiveRoadview.container.remove();
        currentActiveRoadview = null;
        console.log('[Roadview] 활성화된 로드뷰 숨김 완료');
    }
};

/**
 * 특정 구역의 로드뷰를 표시하는 함수 (zones와 지자체 공통 사용)
 */
const showRoadviewForZone = (map, zone, markerPosition, zoneType = 'zone') => {
    // 기존 활성화된 로드뷰 숨기기
    hideActiveRoadview();

    // 로드뷰 컨테이너 생성
    const roadviewContainer = document.createElement('div');
    roadviewContainer.id = `roadview-${zone.id || 'gyeonggi'}`;
    roadviewContainer.style.cssText = `
        position: absolute;
        top: 20px;
        right: 20px;
        width: 300px;
        height: 200px;
        border: 3px solid ${zoneType === 'gyeonggi' ? '#3498db' : '#00AA88'};
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 20;
        background: white;
    `;

    // 헤더 추가
    const header = document.createElement('div');
    header.style.cssText = `
        background: ${zoneType === 'gyeonggi' ? '#3498db' : '#00AA88'};
        color: white;
        padding: 8px 12px;
        font-weight: bold;
        font-size: 14px;
        border-radius: 7px 7px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    const zoneName = zoneType === 'gyeonggi'
        ? (zone.INST_NM || '지자체 주차 거치대')
        : (zone.name || '주차 구역');

    header.innerHTML = `
        <span>${zoneType === 'gyeonggi' ? '🅿️ ' : ''}${zoneName}</span>
        <button id="close-roadview-${zone.id || 'gyeonggi'}" style="
            background: none;
            border: none;
            color: white;
            font-size: 16px;
            cursor: pointer;
            padding: 0;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">×</button>
    `;

    // 로드뷰 컨테이너
    const roadviewDiv = document.createElement('div');
    roadviewDiv.style.cssText = `
        width: 100%;
        height: calc(100% - 40px);
        border-radius: 0 0 7px 7px;
    `;

    roadviewContainer.appendChild(header);
    roadviewContainer.appendChild(roadviewDiv);

    // 지도 컨테이너에 추가
    const mapContainer = document.getElementById('map');
    mapContainer.appendChild(roadviewContainer);

    // 닫기 버튼 이벤트
    document.getElementById(`close-roadview-${zone.id || 'gyeonggi'}`).addEventListener('click', () => {
        hideActiveRoadview();
    });

    // 로드뷰 생성
    try {
        const roadview = new window.kakao.maps.Roadview(roadviewDiv);
        const roadviewClient = new window.kakao.maps.RoadviewClient();

        roadviewClient.getNearestPanoId(markerPosition, 100, (panoId) => {
            if (panoId === null) {
                // 로드뷰가 없는 경우
                roadviewDiv.innerHTML = `
                    <div style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        color: #666;
                        font-size: 14px;
                        text-align: center;
                        padding: 20px;
                    ">
                        이 위치에서는<br>로드뷰를 사용할 수 없습니다
                    </div>
                `;
            } else {
                roadview.setPanoId(panoId, markerPosition);
            }
        });

        // 현재 활성화된 로드뷰로 설정
        currentActiveRoadview = {
            container: roadviewContainer,
            roadview: roadview
        };

        console.log(`[Roadview] ${zoneName} 로드뷰 표시 완료`);

    } catch (error) {
        console.error('[Roadview] 로드뷰 생성 실패:', error);
        roadviewDiv.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #ff4757;
                font-size: 14px;
                text-align: center;
                padding: 20px;
            ">
                로드뷰를 불러올 수 없습니다
            </div>
        `;
    }
};

/**
 * zones JSON 파일의 데이터를 사용해서 주차 가능 구역을 지도에 표시
 */
export const drawZoneParkingAreas = (map, zonesData) => {
    if (!zonesData || !zonesData.zones || !Array.isArray(zonesData.zones)) {
        console.error('[Zone Parking] zones 데이터가 유효하지 않습니다:', zonesData);
        return;
    }

    // 전역에서 접근할 수 있도록 데이터 저장
    window.currentZonesData = zonesData;

    console.log(`[Zone Parking] ${zonesData.zones.length}개 주차 구역 표시 시작`);

    // 지도 클릭 시 로드뷰 숨기기
    window.kakao.maps.event.addListener(map, 'click', () => {
        hideActiveRoadview();
    });

    zonesData.zones.forEach((zone, index) => {
        try {
            if (!zone.coordinates || !Array.isArray(zone.coordinates) || zone.coordinates.length < 3) {
                console.warn(`[Zone ${zone.id || index}] 좌표 데이터가 부족합니다:`, zone.coordinates);
                return;
            }

            // coordinates 배열을 카카오맵 LatLng 객체로 변환
            const path = zone.coordinates.map(coord => {
                if (!Array.isArray(coord) || coord.length < 2) {
                    console.warn(`[Zone ${zone.id || index}] 잘못된 좌표:`, coord);
                    return null;
                }
                // [lng, lat] 순서로 되어 있으므로 순서 주의
                return new window.kakao.maps.LatLng(coord[1], coord[0]);
            }).filter(Boolean); // null 값 제거

            if (path.length < 3) {
                console.warn(`[Zone ${zone.id || index}] 폴리곤을 만들기에 좌표가 부족합니다`);
                return;
            }

            // 주차 가능 구역 폴리곤 생성
            const polygon = new window.kakao.maps.Polygon({
                path: path,
                strokeWeight: 2,
                strokeColor: '#00AA88',
                strokeOpacity: 0.8,
                fillColor: '#00AA88',
                fillOpacity: 0.3
            });

            polygon.setMap(map);

            // 마커 위치가 있으면 마커도 추가
            if (zone.markerPosition && Array.isArray(zone.markerPosition) && zone.markerPosition.length >= 2) {
                const markerPosition = new window.kakao.maps.LatLng(zone.markerPosition[1], zone.markerPosition[0]);

                const marker = new window.kakao.maps.Marker({
                    position: markerPosition,
                    map: map,
                    title: zone.name || `구역 ${index + 1}`
                });

                // 마커 클릭 시 로드뷰 표시
                window.kakao.maps.event.addListener(marker, 'click', () => {
                    showRoadviewForZone(map, zone, markerPosition, 'zone');
                });
            }

            console.log(`[Zone ${zone.id || index}] "${zone.name}" 구역 표시 완료`);

        } catch (error) {
            console.error(`[Zone ${zone.id || index}] 구역 표시 중 오류:`, error);
        }
    });

    console.log('[Zone Parking] 모든 주차 구역 표시 완료');
};

/**
 * 경기도 주차 거치대 데이터를 지자체 지정 마커로 표시
 */
export const drawGyeonggiParkingLots = (map, gyeonggiData) => {
    if (!Array.isArray(gyeonggiData)) {
        console.error('[Gyeonggi Parking] 경기도 데이터가 유효하지 않습니다:', gyeonggiData);
        return;
    }

    console.log(`[Gyeonggi Parking] ${gyeonggiData.length}개 지자체 주차 거치대 표시 시작`);

    // 지자체 주차 거치대용 커스텀 마커 이미지 생성
    const imageSrc = 'data:image/svg+xml;base64,' + btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="#3498db" stroke="white" stroke-width="2"/>
            <text x="12" y="16" text-anchor="middle" fill="white" font-family="Arial" font-size="12" font-weight="bold">P</text>
        </svg>
    `);

    const imageSize = new window.kakao.maps.Size(24, 24);
    const imageOption = { offset: new window.kakao.maps.Point(12, 12) };
    const markerImage = new window.kakao.maps.MarkerImage(imageSrc, imageSize, imageOption);

    let successCount = 0;
    let errorCount = 0;

    gyeonggiData.forEach((item, index) => {
        try {
            const lat = parseFloat(item.REFINE_WGS84_LAT);
            const lng = parseFloat(item.REFINE_WGS84_LOGT);

            if (isNaN(lat) || isNaN(lng)) {
                console.warn(`[Gyeonggi ${index}] 유효하지 않은 좌표:`, item.REFINE_WGS84_LAT, item.REFINE_WGS84_LOGT);
                errorCount++;
                return;
            }

            const position = new window.kakao.maps.LatLng(lat, lng);

            const marker = new window.kakao.maps.Marker({
                position: position,
                map: map,
                image: markerImage,
                title: item.INST_NM || '지자체 주차 거치대'
            });

            // 마커 클릭 시 로드뷰 표시 (기존 infoWindow 대신)
            window.kakao.maps.event.addListener(marker, 'click', () => {
                showRoadviewForZone(map, item, position, 'gyeonggi');
            });

            successCount++;

        } catch (error) {
            console.error(`[Gyeonggi ${index}] 마커 생성 실패:`, error);
            errorCount++;
        }
    });

    console.log(`[Gyeonggi Parking] 완료 - 성공: ${successCount}개, 실패: ${errorCount}개`);
};

// ========== 🚫 주차금지구역 오버레이 기능 (고정덮개 + 움직이는 구멍) ==========

// 전역 변수로 관리
let fixedOverlay = null; // 고정된 전체 덮개
let holePolygons = []; // 움직이는 구멍들

/**
 * 현재 화면의 주차 가능 구역에 구멍 생성/업데이트 (zones 데이터 기반)
 */
const updateParkingHoles = async (map) => {
    // 기존 구멍들 제거
    clearParkingHoles();

    // zones 데이터에서 현재 화면에 포함된 주차 가능 구역만 필터링
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    try {
        // 전역 zones 데이터 가져오기 (Map.jsx에서 전달받은 데이터 사용)
        const visibleZones = window.currentZonesData?.zones?.filter(zone => {
            if (!zone.markerPosition || zone.markerPosition.length < 2) return false;

            const zoneLat = zone.markerPosition[1];
            const zoneLng = zone.markerPosition[0];

            // 현재 화면 범위에 포함되는지 확인
            return zoneLat >= sw.getLat() && zoneLat <= ne.getLat() &&
                zoneLng >= sw.getLng() && zoneLng <= ne.getLng();
        }) || [];

        console.log(`[구멍 업데이트] ${visibleZones.length}개 주차 가능 구역 발견`);

        // 각 주차 가능 구역을 흰색 폴리곤으로 생성 (구멍 효과)
        visibleZones.forEach((zone, index) => {
            try {
                if (!zone.coordinates || zone.coordinates.length < 3) return;

                const holePath = zone.coordinates.map(coord => {
                    if (!Array.isArray(coord) || coord.length < 2) return null;
                    return new window.kakao.maps.LatLng(coord[1], coord[0]);
                }).filter(Boolean);

                if (holePath.length < 3) return;

                // 흰색 폴리곤으로 구멍 효과 생성
                const holePolygon = new window.kakao.maps.Polygon({
                    path: holePath,
                    strokeWeight: 1,
                    strokeColor: '#00AA88',
                    strokeOpacity: 0.8,
                    fillColor: '#FFFFFF', // 흰색으로 덮개를 덮어씀
                    fillOpacity: 1.0,     // 완전 불투명
                    zIndex: 2 // 고정 덮개보다 위에
                });

                holePolygon.setMap(map);
                holePolygons.push(holePolygon);

            } catch (error) {
                console.warn(`[구멍 ${index}] 생성 실패:`, error);
            }
        });

        console.log(`[구멍 업데이트] ${holePolygons.length}개 구멍 생성 완료`);

    } catch (error) {
        console.error('[구멍 업데이트] 실패:', error);
    }
};

/**
 * 고정된 전체 화면 덮개 생성 (화면 전체를 항상 덮음)
 */
const createFixedFullScreenOverlay = (map) => {
    // 이미 생성되어 있으면 스킵
    if (fixedOverlay) {
        console.log('[고정 덮개] 이미 존재함 - 생략');
        return;
    }

    // 지도 전체를 덮는 매우 큰 사각형 (전 세계를 덮을 정도로)
    const globalBounds = [
        new window.kakao.maps.LatLng(-85, -180), // 남서 (남극 근처)
        new window.kakao.maps.LatLng(-85, 180),  // 남동
        new window.kakao.maps.LatLng(85, 180),   // 북동 (북극 근처)
        new window.kakao.maps.LatLng(85, -180),  // 북서
        new window.kakao.maps.LatLng(-85, -180)  // 닫기
    ];

    fixedOverlay = new window.kakao.maps.Polygon({
        path: globalBounds,
        strokeWeight: 0,
        fillColor: '#808080',
        fillOpacity: 0.6,
        zIndex: 1 // 구멍들보다 아래에
    });

    fixedOverlay.setMap(map);
    console.log('[고정 덮개] 전 세계 덮개 생성 완료');
};

/**
 * 기존 구멍들만 제거 (고정 덮개는 유지)
 */
const clearParkingHoles = () => {
    holePolygons.forEach(polygon => {
        if (polygon && polygon.setMap) {
            polygon.setMap(null);
        }
    });
    holePolygons = [];
    console.log('[구멍 제거] 기존 구멍들 제거 완료');
};

/**
 * 주차금지구역 오버레이 생성 (고정된 전체 덮개 + 움직이는 구멍)
 */
export const drawParkingProhibitionOverlay = async (map) => {
    if (!map) return;

    // 1. 고정된 전체 화면 덮개 생성 (최초 1회만)
    createFixedFullScreenOverlay(map);

    // 2. 현재 화면의 주차 가능 구역 구멍들 생성
    await updateParkingHoles(map);
};

/**
 * 주차 가능 구역 구멍만 업데이트 (지도 이동 시 호출)
 */
export const updateParkingProhibitionHoles = async (map) => {
    if (!fixedOverlay) return; // 고정 덮개가 없으면 스킵

    console.log('[구멍 업데이트] 지도 이동으로 인한 구멍 업데이트');
    await updateParkingHoles(map);
};

/**
 * 주차금지 오버레이 완전 제거
 */
export const clearParkingProhibitionOverlay = () => {
    // 고정 덮개 제거
    if (fixedOverlay) {
        fixedOverlay.setMap(null);
        fixedOverlay = null;
    }

    // 구멍들 제거
    clearParkingHoles();

    console.log('[주차금지구역] 고정 덮개 + 모든 구멍 제거 완료');
};