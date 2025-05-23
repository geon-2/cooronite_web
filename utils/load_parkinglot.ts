interface Parkinglot_G {
    MNGINST_NM: string;
    PARKPLC_INSTL_PLC: string;
    REFINE_ROADNM_ADDR: string;
    REFINE_LOTNO_ADDR: string;
    REFINE_WGS84_LAT: string;
    REFINE_WGS84_LOGT: string;
}

export const load_parkinglot = () => {
    return fetch('../data/parkinglot_g.json', {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
    }).then((response) => response.json()) // 읽어온 데이터를 json 으로 변환
        .then((json) => {
            return json.map((v: Parkinglot_G) => {
                return {"lat": v.REFINE_WGS84_LAT, "lot": v.REFINE_WGS84_LOGT}
            })
        })
        .catch((error) => console.error('Fetch error : ', error));
}