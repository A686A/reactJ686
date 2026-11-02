import { formatNumber } from "../../properties/model/property";
export default function PurchaseSummary({ application }) {
  const property = application.propertySnapshot;
  const fields = {
    房源名称: property.name,
    房源编号: property.code,
    房源地址: `${property.city} · ${property.district} · ${property.address}`,
    建筑面积: `${formatNumber(property.area)} ㎡`,
    申请时挂牌价: `${formatNumber(property.price)} 万元`,
    成交总价: `${formatNumber(application.dealPrice)} 万元`,
    意向定金: `${formatNumber(application.deposit)} 万元`,
    付款方式: application.paymentMethod,
    买方姓名: application.buyerName,
    联系电话: application.buyerPhone,
    预计签约日期: application.expectedSigningDate,
    备注: application.remarks || "—",
  };
  return (
    <dl className="detail-grid">
      {Object.entries(fields).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
